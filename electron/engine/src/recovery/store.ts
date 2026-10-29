import { join } from 'node:path'

import * as v from 'valibot'

import {
  checkpointToBytes,
  type Checkpoint,
  type DocumentEngine,
  type LogEntry
} from '@open-pencil/session'
import { logEntrySchema } from '@open-pencil/session/schema'

import { createDocumentEngine } from '../graph/create'
import { createPenCodec } from '../pen/codec'
import { saveAtomic } from './atomic'
import { RecoveryError } from './error'
import { RECOVERY_FILES, nodeFileSystem, readOptional, type DurableFileSystem } from './files'
import { encodeJSON } from './json'
import { createRecentFiles, type RecentFile } from './recent'

export interface RecoveryDocument {
  id: string
  name: string
}

export interface RecoveryStore {
  /**
   * Persists `checkpoint` for `document`, then drops log entries at or before its applied
   * sequence. A failure while writing the snapshot leaves the previous snapshot in place.
   */
  saveSnapshot(document: RecoveryDocument, checkpoint: Checkpoint): Promise<void>
  /**
   * Stores log entries whose sequence is greater than the snapshot's applied sequence.
   * Saving the same sequence again replaces that entry, so a coalesced edit stays durable.
   */
  append(document: RecoveryDocument, entries: readonly LogEntry[]): Promise<void>
  recentFiles(): Promise<RecentFile[]>
  remember(file: RecentFile): Promise<RecentFile[]>
}

const documentIdentitySchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.string()
})

const recoveryLogSchema = v.object({
  entries: v.array(logEntrySchema)
})

/**
 * One document's crash-recovery directory. The snapshot is a session checkpoint, which
 * `createPenCodec` reads. The log holds only entries appended after that checkpoint's
 * applied sequence. `recover` restores the snapshot and replays those later entries.
 */
export function createRecoveryStore(
  dir: string,
  filesystem: DurableFileSystem = nodeFileSystem
): RecoveryStore {
  let chain = Promise.resolve()
  const recent = createRecentFiles(dir, filesystem)

  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = chain.then(operation, operation)
    chain = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  return {
    saveSnapshot(document, checkpoint) {
      return run(() => writeSnapshot(dir, filesystem, document, checkpoint))
    },
    append(document, entries) {
      return run(() => appendEntries(dir, filesystem, document, entries))
    },
    recentFiles() {
      return run(() => recent.list())
    },
    remember(file) {
      return run(() => recent.remember(file))
    }
  }
}

/**
 * Restores the checkpoint in `dir` on a new document engine and replays log entries
 * strictly after that checkpoint's applied sequence. An empty directory is an empty document.
 */
export async function recover(
  dir: string,
  filesystem: DurableFileSystem = nodeFileSystem
): Promise<DocumentEngine> {
  const codec = createPenCodec()
  const snapshot = await readOptional(filesystem, join(dir, RECOVERY_FILES.snapshot))
  const checkpoint = snapshot ? codec.read(snapshot) : null
  const identity = await readIdentity(dir, filesystem)
  const engine = createDocumentEngine(
    {
      name: identity?.name ?? 'Recovered',
      ...(identity ? { id: identity.id } : {})
    },
    { codec }
  )
  if (checkpoint) engine.restore(checkpoint)
  replay(engine, entriesAfter(await readLog(dir, filesystem), appliedSequence(engine.checkpoint())))
  return engine
}

async function writeSnapshot(
  dir: string,
  filesystem: DurableFileSystem,
  document: RecoveryDocument,
  checkpoint: Checkpoint
): Promise<void> {
  const identity = identityBytes(document)
  const bytes = snapshotBytes(checkpoint)
  const sequence = appliedSequence(checkpoint)
  await filesystem.mkdir(dir)
  await saveAtomic(join(dir, RECOVERY_FILES.snapshot), bytes, filesystem)
  await saveAtomic(join(dir, RECOVERY_FILES.document), identity, filesystem)
  const kept = entriesAfter(await readLog(dir, filesystem), sequence)
  await writeLog(dir, filesystem, kept)
}

async function appendEntries(
  dir: string,
  filesystem: DurableFileSystem,
  document: RecoveryDocument,
  entries: readonly LogEntry[]
): Promise<void> {
  const identity = identityBytes(document)
  const sequence = await readSnapshotSequence(dir, filesystem)
  const merged = mergeEntries(await readLog(dir, filesystem), entries, sequence)
  await filesystem.mkdir(dir)
  await writeLog(dir, filesystem, merged)
  await saveAtomic(join(dir, RECOVERY_FILES.document), identity, filesystem)
}

function replay(
  engine: ReturnType<typeof createDocumentEngine>,
  entries: readonly LogEntry[]
): void {
  for (const entry of entries) {
    engine.applyLogged(entry.forward, entry.inverse, entry.coalesceKey)
  }
}

function appliedSequence(checkpoint: Checkpoint): number {
  const undone = Math.min(Math.max(checkpoint.undone, 0), checkpoint.entries.length)
  const index = checkpoint.entries.length - undone - 1
  if (index < 0) return 0
  return checkpoint.entries[index].sequence
}

function entriesAfter(entries: readonly LogEntry[], sequence: number): LogEntry[] {
  return mergeEntries(entries, [], sequence)
}

function mergeEntries(
  stored: readonly LogEntry[],
  incoming: readonly LogEntry[],
  sequence: number
): LogEntry[] {
  const bySequence = new Map<number, LogEntry>()
  for (const entry of stored) {
    if (entry.sequence > sequence) bySequence.set(entry.sequence, entry)
  }
  for (const entry of incoming) {
    if (entry.sequence > sequence) bySequence.set(entry.sequence, entry)
  }
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence)
}

/**
 * Checkpoint JSON, not a `.pen` export. The pen codec accepts both, and a `.pen` file
 * drops history and sequence, which would make later log entries apply twice.
 */
function snapshotBytes(checkpoint: Checkpoint): Uint8Array {
  const bytes = checkpointToBytes(checkpoint)
  const read = createPenCodec().read(bytes)
  if (
    read.entries.length !== checkpoint.entries.length ||
    read.undone !== checkpoint.undone ||
    read.tool !== checkpoint.tool ||
    read.selection.length !== checkpoint.selection.length
  ) {
    throw new RecoveryError('Snapshot could not be read back as a checkpoint')
  }
  return bytes
}

function identityBytes(document: RecoveryDocument): Uint8Array {
  const parsed = v.safeParse(documentIdentitySchema, document)
  if (!parsed.success) {
    throw new RecoveryError(`Document identity is invalid: ${v.summarize(parsed.issues)}`)
  }
  return encodeJSON(parsed.output)
}

async function readIdentity(
  dir: string,
  filesystem: DurableFileSystem
): Promise<RecoveryDocument | null> {
  const bytes = await readOptional(filesystem, join(dir, RECOVERY_FILES.document))
  if (!bytes) return null
  const text = new TextDecoder().decode(bytes)
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), documentIdentitySchema), text)
  if (!parsed.success) {
    throw new RecoveryError(`Document identity could not be read: ${v.summarize(parsed.issues)}`)
  }
  return parsed.output
}

async function readSnapshotSequence(dir: string, filesystem: DurableFileSystem): Promise<number> {
  const bytes = await readOptional(filesystem, join(dir, RECOVERY_FILES.snapshot))
  if (!bytes) return 0
  return appliedSequence(createPenCodec().read(bytes))
}

async function readLog(dir: string, filesystem: DurableFileSystem): Promise<LogEntry[]> {
  const bytes = await readOptional(filesystem, join(dir, RECOVERY_FILES.log))
  if (!bytes) return []
  const text = new TextDecoder().decode(bytes)
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), recoveryLogSchema), text)
  if (!parsed.success) {
    throw new RecoveryError(`Operation log could not be read: ${v.summarize(parsed.issues)}`)
  }
  return dedupe(parsed.output.entries)
}

async function writeLog(
  dir: string,
  filesystem: DurableFileSystem,
  entries: readonly LogEntry[]
): Promise<void> {
  await saveAtomic(
    join(dir, RECOVERY_FILES.log),
    encodeJSON({ entries: dedupe(entries) }),
    filesystem
  )
}

function dedupe(entries: readonly LogEntry[]): LogEntry[] {
  const bySequence = new Map<number, LogEntry>()
  for (const entry of entries) bySequence.set(entry.sequence, entry)
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence)
}

import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  RECENT_FILE_LIMIT,
  RECOVERY_FILES,
  RecoveryError,
  createRecoveryStore,
  recover,
  saveAtomic,
  type DurableFileSystem
} from '#engine/recovery'
import * as v from 'valibot'

import { createDocumentEngine } from '@open-pencil/engine'
import {
  InvalidDocumentError,
  type Command,
  type DocumentEngine,
  type JSONValue
} from '@open-pencil/session'
import { logEntrySchema } from '@open-pencil/session/schema'

function create(id: string, index: number, fields: Record<string, string | number> = {}): Command {
  return {
    type: 'create',
    parentId: null,
    index,
    node: {
      id,
      type: 'rectangle',
      fields: { name: id, ...fields },
      passthrough: id === 'a' ? { vendor: 'kept' } : {}
    }
  }
}

function field(engine: DocumentEngine, id: string, key: string): JSONValue | undefined {
  return engine.checkpoint().nodes.find((node) => node.id === id)?.fields[key]
}

async function rejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected the promise to reject')
}

function coded(message: string, code: string): Error {
  const error = new Error(message)
  Object.assign(error, { code })
  return error
}

interface MemoryDisk {
  filesystem: DurableFileSystem
  files: Map<string, Uint8Array>
  calls: string[]
  setFailWrite(fail: (path: string) => boolean): void
  setSyncError(error: Error | null): void
}

function memoryDisk(): MemoryDisk {
  const files = new Map<string, Uint8Array>()
  const calls: string[] = []
  let failWrite: (path: string) => boolean = () => false
  let syncError: Error | null = null
  const filesystem: DurableFileSystem = {
    async readFile(path) {
      const bytes = files.get(path)
      if (!bytes) throw coded(`ENOENT: ${path}`, 'ENOENT')
      return new Uint8Array(bytes)
    },
    async writeFile(path, bytes) {
      calls.push(`write ${path}`)
      if (failWrite(path)) throw new Error('temp write failed')
      files.set(path, new Uint8Array(bytes))
    },
    async rename(from, to) {
      calls.push(`rename ${from} ${to}`)
      const bytes = files.get(from)
      if (!bytes) throw coded(`ENOENT: ${from}`, 'ENOENT')
      files.set(to, bytes)
      files.delete(from)
    },
    async sync(path) {
      calls.push(`sync ${path}`)
      if (syncError) throw syncError
    },
    async remove(path) {
      calls.push(`remove ${path}`)
      files.delete(path)
    },
    async mkdir(path) {
      calls.push(`mkdir ${path}`)
    }
  }
  return {
    filesystem,
    files,
    calls,
    setFailWrite(fail) {
      failWrite = fail
    },
    setSyncError(error) {
      syncError = error
    }
  }
}

function textOf(disk: MemoryDisk, path: string): string {
  const bytes = disk.files.get(path)
  if (!bytes) throw new Error(`missing ${path}`)
  return new TextDecoder().decode(bytes)
}

function logSequences(disk: MemoryDisk, dir: string): number[] {
  const text = textOf(disk, join(dir, RECOVERY_FILES.log))
  const parsed = v.safeParse(
    v.pipe(v.string(), v.parseJson(), v.object({ entries: v.array(logEntrySchema) })),
    text
  )
  if (!parsed.success) throw new Error(v.summarize(parsed.issues))
  return parsed.output.entries.map((entry) => entry.sequence)
}

describe('saveAtomic', () => {
  test('replaces the destination after the temporary file is synced', async () => {
    const disk = memoryDisk()
    const destination = '/docs/page.pen'
    disk.files.set(destination, new Uint8Array([1, 1, 1]))
    const next = new Uint8Array([4, 5, 6, 7])

    await saveAtomic(destination, next, disk.filesystem)

    expect(disk.files.get(destination)).toEqual(next)
    expect([...disk.files.keys()]).toEqual([destination])
    expect(disk.calls).toHaveLength(3)
    const temporary = disk.calls[0].slice('write '.length)
    expect(disk.calls[1]).toBe(`sync ${temporary}`)
    expect(disk.calls[2]).toBe(`rename ${temporary} ${destination}`)
    expect(dirname(temporary)).toBe(dirname(destination))
    expect(temporary.endsWith('.tmp')).toBe(true)
  })

  test('leaves the destination unchanged when the temporary write throws', async () => {
    const disk = memoryDisk()
    const destination = '/docs/page.pen'
    const original = new Uint8Array([9, 8, 7])
    disk.files.set(destination, original)
    disk.setFailWrite(() => true)

    const error = await rejected(saveAtomic(destination, new Uint8Array([1]), disk.filesystem))
    if (!(error instanceof Error)) throw new Error('Expected an Error')
    expect(error.message).toBe('temp write failed')

    expect(disk.files.get(destination)).toEqual(original)
    expect([...disk.files.keys()]).toEqual([destination])
    expect(disk.calls.some((call) => call.startsWith('rename '))).toBe(false)
  })

  test('replaces the destination when the platform cannot sync', async () => {
    const disk = memoryDisk()
    const destination = '/docs/page.pen'
    disk.files.set(destination, new Uint8Array([1]))
    disk.setSyncError(coded('sync unsupported', 'ENOTSUP'))
    const next = new Uint8Array([2, 3])

    await saveAtomic(destination, next, disk.filesystem)

    expect(disk.files.get(destination)).toEqual(next)
    expect([...disk.files.keys()]).toEqual([destination])
  })

  test('leaves the destination unchanged when sync fails', async () => {
    const disk = memoryDisk()
    const destination = '/docs/page.pen'
    const original = new Uint8Array([1, 2])
    disk.files.set(destination, original)
    disk.setSyncError(coded('disk', 'EIO'))

    const error = await rejected(saveAtomic(destination, new Uint8Array([9]), disk.filesystem))
    if (!(error instanceof Error)) throw new Error('Expected an Error')
    expect(error.message).toBe('disk')

    expect(disk.files.get(destination)).toEqual(original)
    expect([...disk.files.keys()]).toEqual([destination])
    expect(disk.calls.some((call) => call.startsWith('rename '))).toBe(false)
    expect(disk.calls.some((call) => call.startsWith('remove ') && call.endsWith('.tmp'))).toBe(
      true
    )
  })

  test('replaces a file on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'open-pencil-atomic-'))
    try {
      const path = join(dir, 'page.pen')
      await writeFile(path, new Uint8Array([1, 2, 3]))
      await saveAtomic(path, new Uint8Array([4, 5, 6, 7]))
      expect(new Uint8Array(await readFile(path))).toEqual(new Uint8Array([4, 5, 6, 7]))
      expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('recovery store', () => {
  test('restores a snapshot and replays only later log entries', async () => {
    const disk = memoryDisk()
    const dir = '/recovery'
    const store = createRecoveryStore(dir, disk.filesystem)
    const engine = createDocumentEngine({ name: 'Poster', id: 'poster' })
    engine.apply(create('a', 0, { x: 1, y: 2, width: 10, height: 8 }))
    engine.apply(create('b', 1, { x: 2 }))
    engine.apply({ type: 'set-selection', ids: ['a'] })
    engine.apply({ type: 'set-tool', tool: 'hand' })
    await store.saveSnapshot({ id: engine.id, name: engine.name }, engine.checkpoint())

    engine.apply({ type: 'set-variable', name: 'gap', value: 8 })
    engine.apply({ type: 'edit', id: 'a', fields: { x: 5 } })
    engine.apply({ type: 'group', ids: ['a', 'b'] })
    await store.append({ id: engine.id, name: engine.name }, engine.checkpoint().entries)

    expect(logSequences(disk, dir)).toEqual([3, 4, 5])
    expect(textOf(disk, join(dir, RECOVERY_FILES.snapshot))).toContain('"tool":"hand"')

    const recovered = await recover(dir, disk.filesystem)
    expect(recovered.id).toBe('poster')
    expect(recovered.name).toBe('Poster')
    expect(recovered.checkpoint().nodes).toEqual(engine.checkpoint().nodes)
    expect(recovered.checkpoint().rootIds).toEqual(engine.checkpoint().rootIds)
    expect(recovered.checkpoint().selection).toEqual(['a'])
    expect(recovered.checkpoint().tool).toBe('hand')
    expect(recovered.checkpoint().variables).toEqual({ gap: { value: 8 } })
    expect(recovered.checkpoint().entries).toHaveLength(engine.checkpoint().entries.length)

    recovered.apply({ type: 'undo' })
    expect(recovered.checkpoint().rootIds).toEqual(['a', 'b'])
    expect(field(recovered, 'a', 'x')).toBe(5)
    recovered.apply({ type: 'undo' })
    expect(field(recovered, 'a', 'x')).toBe(1)

    const stale = {
      entries: engine.checkpoint().entries
    }
    await saveAtomic(
      join(dir, RECOVERY_FILES.log),
      new TextEncoder().encode(JSON.stringify(stale)),
      disk.filesystem
    )
    const again = await recover(dir, disk.filesystem)
    expect(again.checkpoint().nodes).toEqual(engine.checkpoint().nodes)
    expect(again.checkpoint().entries.map((entry) => entry.sequence)).toEqual(
      engine.checkpoint().entries.map((entry) => entry.sequence)
    )
  })

  test('replays the latest coalesced edit and undoes it in one step', async () => {
    const disk = memoryDisk()
    const dir = '/scrub'
    const store = createRecoveryStore(dir, disk.filesystem)
    const engine = createDocumentEngine({ name: 'Scrub', id: 'scrub' })
    engine.apply(create('rect', 0, { x: 1 }))
    await store.saveSnapshot({ id: engine.id, name: engine.name }, engine.checkpoint())
    engine.apply({ type: 'edit', id: 'rect', fields: { x: 4 }, coalesceKey: 'x' })
    await store.append({ id: engine.id, name: engine.name }, engine.checkpoint().entries)
    engine.apply({ type: 'edit', id: 'rect', fields: { x: 9 }, coalesceKey: 'x' })
    await store.append({ id: engine.id, name: engine.name }, engine.checkpoint().entries)

    expect(logSequences(disk, dir)).toEqual([2])
    const recovered = await recover(dir, disk.filesystem)
    expect(field(recovered, 'rect', 'x')).toBe(9)
    expect(recovered.checkpoint().entries).toHaveLength(2)
    recovered.apply({ type: 'undo' })
    expect(field(recovered, 'rect', 'x')).toBe(1)
  })

  test('replays an edit that reused a sequence after undo', async () => {
    const disk = memoryDisk()
    const dir = '/undo'
    const store = createRecoveryStore(dir, disk.filesystem)
    const engine = createDocumentEngine({ name: 'Undo', id: 'undo' })
    engine.apply(create('rect', 0, { x: 1 }))
    engine.apply({ type: 'edit', id: 'rect', fields: { x: 4 } })
    engine.apply({ type: 'undo' })
    await store.saveSnapshot({ id: engine.id, name: engine.name }, engine.checkpoint())
    engine.apply({ type: 'edit', id: 'rect', fields: { x: 9 } })
    await store.append({ id: engine.id, name: engine.name }, engine.checkpoint().entries)

    const recovered = await recover(dir, disk.filesystem)
    expect(field(recovered, 'rect', 'x')).toBe(9)
    recovered.apply({ type: 'undo' })
    expect(field(recovered, 'rect', 'x')).toBe(1)
  })

  test('recovers an unsaved document from the log alone', async () => {
    const disk = memoryDisk()
    const dir = '/draft'
    const store = createRecoveryStore(dir, disk.filesystem)
    const engine = createDocumentEngine({ name: 'Draft', id: 'draft' })
    engine.apply(create('rect', 0, { x: 3, y: 4, width: 5, height: 6 }))
    engine.apply({ type: 'edit', id: 'rect', fields: { x: 8 } })
    await store.append({ id: engine.id, name: engine.name }, engine.checkpoint().entries)

    const recovered = await recover(dir, disk.filesystem)
    expect(recovered.id).toBe('draft')
    expect(recovered.name).toBe('Draft')
    expect(recovered.checkpoint().nodes).toEqual(engine.checkpoint().nodes)
    expect(recovered.checkpoint().rootIds).toEqual(engine.checkpoint().rootIds)
  })

  test('an empty directory restores an empty document', async () => {
    const disk = memoryDisk()
    const recovered = await recover('/empty', disk.filesystem)
    expect(recovered.name).toBe('Recovered')
    expect(recovered.id.length).toBeGreaterThan(0)
    expect(recovered.checkpoint().nodes).toEqual([])
    expect(recovered.checkpoint().entries).toEqual([])
  })

  test('a corrupt snapshot is rejected by the pen codec', async () => {
    const disk = memoryDisk()
    const dir = '/bad'
    await saveAtomic(
      join(dir, RECOVERY_FILES.snapshot),
      new TextEncoder().encode('{"version":1}'),
      disk.filesystem
    )
    expect(await rejected(recover(dir, disk.filesystem))).toBeInstanceOf(InvalidDocumentError)
  })

  test('a failed snapshot replace leaves the previous snapshot', async () => {
    const disk = memoryDisk()
    const dir = '/keep'
    const store = createRecoveryStore(dir, disk.filesystem)
    const engine = createDocumentEngine({ name: 'Doc', id: 'doc' })
    engine.apply(create('rect', 0, { x: 1 }))
    await store.saveSnapshot({ id: engine.id, name: engine.name }, engine.checkpoint())
    engine.apply({ type: 'edit', id: 'rect', fields: { x: 9 } })
    await store.append({ id: engine.id, name: engine.name }, engine.checkpoint().entries)
    const saved = disk.files.get(join(dir, RECOVERY_FILES.snapshot))
    if (!saved) throw new Error('missing snapshot')
    const previous = new Uint8Array(saved)

    disk.setFailWrite((path) => path.includes(`.${RECOVERY_FILES.snapshot}.`))
    engine.apply({ type: 'edit', id: 'rect', fields: { x: 3 } })
    const error = await rejected(
      store.saveSnapshot({ id: engine.id, name: engine.name }, engine.checkpoint())
    )
    if (!(error instanceof Error)) throw new Error('Expected an Error')
    expect(error.message).toBe('temp write failed')

    expect(disk.files.get(join(dir, RECOVERY_FILES.snapshot))).toEqual(previous)
    disk.setFailWrite(() => false)
    const recovered = await recover(dir, disk.filesystem)
    expect(field(recovered, 'rect', 'x')).toBe(9)
  })

  test('remembers recent files and ignores a list that does not match the schema', async () => {
    const disk = memoryDisk()
    const dir = '/recent'
    const store = createRecoveryStore(dir, disk.filesystem)
    expect(await store.recentFiles()).toEqual([])

    const first = await store.remember({ path: '/a.pen', name: 'A' })
    expect(first).toEqual([{ path: '/a.pen', name: 'A' }])
    const second = await store.remember({ path: '/b.pen', name: 'B' })
    expect(second).toEqual([
      { path: '/b.pen', name: 'B' },
      { path: '/a.pen', name: 'A' }
    ])
    const reread = createRecoveryStore(dir, disk.filesystem)
    expect(await reread.recentFiles()).toEqual(second)

    for (let index = 0; index < RECENT_FILE_LIMIT + 2; index += 1) {
      await store.remember({ path: `/f/${index}.pen`, name: `${index}.pen` })
    }
    const capped = await store.recentFiles()
    expect(capped).toHaveLength(RECENT_FILE_LIMIT)
    expect(capped[0]).toEqual({
      path: `/f/${RECENT_FILE_LIMIT + 1}.pen`,
      name: `${RECENT_FILE_LIMIT + 1}.pen`
    })
    const moved = await store.remember({ path: '/f/5.pen', name: 'renamed.pen' })
    expect(moved[0]).toEqual({ path: '/f/5.pen', name: 'renamed.pen' })
    expect(moved.filter((file) => file.path === '/f/5.pen')).toHaveLength(1)
    expect(moved).toHaveLength(RECENT_FILE_LIMIT)

    await saveAtomic(
      join(dir, RECOVERY_FILES.recent),
      new TextEncoder().encode('{'),
      disk.filesystem
    )
    expect(await store.recentFiles()).toEqual([])
    await saveAtomic(
      join(dir, RECOVERY_FILES.recent),
      new TextEncoder().encode('[1, 2]'),
      disk.filesystem
    )
    expect(await store.recentFiles()).toEqual([])
    expect(await rejected(store.remember({ path: '', name: 'nope' }))).toBeInstanceOf(RecoveryError)
  })

  test('recovers a document from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'open-pencil-recovery-'))
    try {
      const engine = createDocumentEngine({ name: 'Disk', id: 'disk' })
      engine.apply(create('rect', 0, { x: 1 }))
      const store = createRecoveryStore(dir)
      await store.saveSnapshot({ id: engine.id, name: engine.name }, engine.checkpoint())
      engine.apply({ type: 'edit', id: 'rect', fields: { x: 6 } })
      await store.append({ id: engine.id, name: engine.name }, engine.checkpoint().entries)
      const recovered = await recover(dir)
      expect(recovered.id).toBe('disk')
      expect(field(recovered, 'rect', 'x')).toBe(6)
      recovered.apply({ type: 'undo' })
      expect(field(recovered, 'rect', 'x')).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

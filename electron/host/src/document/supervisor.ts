import {
  assertPayloadWithinCap,
  documentProcessCap,
  isMutation,
  JOB_POOL_CAP,
  type BoundsEntry,
  type Checkpoint,
  type FrameUpdate,
  type LayerTreeQuery,
  type LayerTreeWindow,
  type OpenDocumentSpec,
  type ProcessSupervisor,
  type SessionEvent,
  type ViewportSummary
} from '@open-pencil/session'

import {
  decodeBytes,
  encodeBytes,
  encodeDocumentMessage,
  parseDocumentOutbound,
  type DocumentRequest,
  type DocumentResult,
  type DocumentTilePacket
} from './protocol'
import type { DocumentRuntime, DocumentRuntimeFactory } from './runtime'

export interface UtilitySupervisor extends ProcessSupervisor {
  exportBytes(id: string): Promise<Uint8Array>
  spatialIndex(id: string): Promise<BoundsEntry[]>
  onFrame(listener: (frame: FrameUpdate) => void): () => void
  onTile(listener: (packet: DocumentTilePacket) => void): () => void
}

export interface UtilitySupervisorOptions {
  factory: DocumentRuntimeFactory
  cpuCount?: number
  jobCap?: number
}

interface Pending {
  done: boolean
  resolve: (result: DocumentResult) => void
}

interface Slot {
  id: string
  name: string
  readOnly: boolean
  bytes: Uint8Array | undefined
  runtime: DocumentRuntime
  stopMessage: () => void
  stopExit: () => void
  epoch: number
  checkpoint: Checkpoint | null
  listeners: Set<(event: SessionEvent) => void>
  pending: Map<string, Pending>
  exitWaiters: Array<() => void>
  closed: boolean
  restarting: boolean
  recovery: Promise<void> | null
}

const EMPTY_LAYER_TREE = {
  rows: [],
  total: 0
} as const

function emptyLayerTree(query: LayerTreeQuery): LayerTreeWindow {
  return {
    parentId: query.parentId,
    offset: query.offset,
    limit: query.limit,
    rows: [...EMPTY_LAYER_TREE.rows],
    total: EMPTY_LAYER_TREE.total
  }
}

function settle(pending: Pending, result: DocumentResult): void {
  if (pending.done) return
  pending.done = true
  pending.resolve(result)
}

/**
 * One utility process per open document, capped by `documentProcessCap`.
 * A killed process is replaced from the last checkpoint. The window is not
 * part of this object, so recovery cannot close it.
 */
export function createUtilitySupervisor(options: UtilitySupervisorOptions): UtilitySupervisor {
  const documentCap = documentProcessCap(options.cpuCount ?? 2)
  const jobCap = options.jobCap ?? JOB_POOL_CAP
  const slots = new Map<string, Slot>()
  const waiters: Array<() => void> = []
  let requestSequence = 0
  let jobsRunning = 0
  let jobSequence = 0
  const jobWaiters: Array<() => void> = []
  const activeJobs = new Set<string>()
  const frameListeners = new Set<(frame: FrameUpdate) => void>()
  const tileListeners = new Set<(packet: DocumentTilePacket) => void>()

  function emit(slot: Slot, event: SessionEvent): void {
    for (const listener of slot.listeners) listener(event)
  }

  function releaseDocument(): void {
    const next = waiters.shift()
    if (next) next()
  }

  function failPending(slot: Slot, reason: string): void {
    for (const [requestId, pending] of slot.pending) {
      slot.pending.delete(requestId)
      settle(pending, { type: 'result', requestId, ok: false, reason })
    }
  }

  function attach(slot: Slot, runtime: DocumentRuntime): void {
    slot.stopMessage()
    slot.stopExit()
    slot.epoch += 1
    const epoch = slot.epoch
    slot.runtime = runtime
    slot.stopMessage = runtime.onMessage((packet) => {
      if (epoch !== slot.epoch) return
      if (packet.type === 'tile') {
        if (packet.documentId === slot.id) {
          for (const listener of tileListeners) listener(packet)
        }
        return
      }
      const parsed = parseDocumentOutbound(packet.text)
      if (!parsed.success) return
      const message = parsed.output
      if (message.type === 'frame') {
        if (message.documentId === slot.id) {
          for (const listener of frameListeners) {
            listener({ documentId: message.documentId, tiles: message.tiles })
          }
        }
        return
      }
      const result = message
      if (result.checkpoint) slot.checkpoint = result.checkpoint
      const pending = slot.pending.get(result.requestId)
      if (!pending) return
      slot.pending.delete(result.requestId)
      settle(pending, result)
    })
    slot.stopExit = runtime.onExit(() => {
      if (epoch !== slot.epoch) return
      failPending(slot, 'document process failed')
      const waitersForExit = slot.exitWaiters.splice(0)
      for (const waiter of waitersForExit) waiter()
      if (slot.closed || slot.restarting) return
      void startRecovery(slot)
    })
  }

  function nextRequestId(): string {
    requestSequence += 1
    return `r${requestSequence}`
  }

  function request(slot: Slot, message: DocumentRequest): Promise<DocumentResult> {
    const requestId = message.requestId
    const encoded = encodeDocumentMessage(message)
    return new Promise((resolve) => {
      const pending: Pending = { done: false, resolve }
      slot.pending.set(requestId, pending)
      try {
        slot.runtime.send(encoded)
      } catch (error) {
        slot.pending.delete(requestId)
        const reason = error instanceof Error ? error.message : 'document process failed'
        settle(pending, { type: 'result', requestId, ok: false, reason })
      }
    })
  }

  async function handshake(slot: Slot, spec: OpenDocumentSpec): Promise<void> {
    const bytes = encodeBytes(spec.bytes)
    const openSpec = {
      id: slot.id,
      name: spec.name,
      ...(spec.readOnly === undefined ? {} : { readOnly: spec.readOnly })
    }
    const result = await request(
      slot,
      bytes === undefined
        ? { type: 'open', requestId: nextRequestId(), spec: openSpec }
        : { type: 'open', requestId: nextRequestId(), spec: openSpec, bytes }
    )
    if (!result.ok || !result.checkpoint) throw new Error(result.reason ?? 'open failed')
    slot.checkpoint = result.checkpoint
  }

  async function recover(slot: Slot): Promise<void> {
    if (slot.closed) return
    const previous = slot.checkpoint
    emit(slot, { type: 'crashed', documentId: slot.id })
    slot.restarting = true
    const runtime = options.factory.spawn()
    attach(slot, runtime)
    try {
      if (previous) {
        await handshake(slot, { id: slot.id, name: slot.name, readOnly: slot.readOnly })
        const restored = await request(slot, {
          type: 'restore',
          requestId: nextRequestId(),
          checkpoint: previous
        })
        if (!restored.ok) throw new Error(restored.reason ?? 'restore failed')
      } else {
        await handshake(slot, {
          id: slot.id,
          name: slot.name,
          readOnly: slot.readOnly,
          bytes: slot.bytes
        })
      }
      emit(slot, { type: 'recovered', documentId: slot.id })
    } catch (error) {
      console.error('document recovery failed', error)
      slot.closed = true
      try {
        runtime.kill()
      } catch (killError) {
        console.error('document process did not stop', killError)
      }
      if (slots.get(slot.id) === slot) {
        slots.delete(slot.id)
        releaseDocument()
      }
    } finally {
      slot.restarting = false
    }
  }

  function startRecovery(slot: Slot): Promise<void> {
    if (slot.closed) return Promise.resolve()
    if (slot.recovery) return slot.recovery
    slot.recovery = recover(slot).finally(() => {
      slot.recovery = null
    })
    return slot.recovery
  }

  function createSlot(id: string, spec: OpenDocumentSpec, runtime: DocumentRuntime): Slot {
    const slot: Slot = {
      id,
      name: spec.name,
      readOnly: spec.readOnly === true,
      bytes: spec.bytes,
      runtime,
      stopMessage: () => undefined,
      stopExit: () => undefined,
      epoch: 0,
      checkpoint: null,
      listeners: new Set(),
      pending: new Map(),
      exitWaiters: [],
      closed: false,
      restarting: false,
      recovery: null
    }
    attach(slot, runtime)
    return slot
  }

  async function waitForDocument(): Promise<void> {
    if (slots.size < documentCap) return
    await new Promise<void>((resolve) => {
      waiters.push(resolve)
    })
  }

  async function waitForJob(): Promise<void> {
    if (jobsRunning < jobCap) return
    await new Promise<void>((resolve) => {
      jobWaiters.push(resolve)
    })
  }

  return {
    documentCap,
    jobCap,
    async open(spec) {
      if (slots.size >= documentCap) await waitForDocument()
      const id = spec.id && spec.id.length > 0 ? spec.id : crypto.randomUUID()
      const runtime = options.factory.spawn()
      const slot = createSlot(id, { ...spec, id }, runtime)
      slots.set(id, slot)
      slot.restarting = true
      try {
        await handshake(slot, { ...spec, id })
        slot.bytes = spec.bytes
        slot.restarting = false
        return id
      } catch (error) {
        slot.closed = true
        runtime.kill()
        slot.restarting = false
        if (slots.get(id) === slot) {
          slots.delete(id)
          releaseDocument()
        }
        throw error instanceof Error ? error : new Error('open failed')
      }
    },
    async close(id) {
      const slot = slots.get(id)
      if (!slot) return
      slot.closed = true
      failPending(slot, 'missing-document')
      slot.runtime.kill()
      slots.delete(id)
      releaseDocument()
    },
    async submit(id, command, _priority) {
      const slot = slots.get(id)
      if (!slot || slot.closed) {
        return { ack: { accepted: false, sequence: 0, reason: 'missing-document' }, events: [] }
      }
      if (slot.readOnly && isMutation(command)) {
        return { ack: { accepted: false, sequence: 0, reason: 'read-only' }, events: [] }
      }
      assertPayloadWithinCap(command)
      const result = await request(slot, { type: 'apply', requestId: nextRequestId(), command })
      if (!result.ok || !result.apply) {
        return {
          ack: { accepted: false, sequence: 0, reason: result.reason ?? 'document process failed' },
          events: []
        }
      }
      for (const event of result.apply.events) emit(slot, event)
      return result.apply
    },
    async layerTree(id, query) {
      const slot = slots.get(id)
      if (!slot || slot.closed) return emptyLayerTree(query)
      const result = await request(slot, {
        type: 'layer-tree',
        requestId: nextRequestId(),
        query
      })
      return result.ok && result.layerTree ? result.layerTree : emptyLayerTree(query)
    },
    async selection(id) {
      const slot = slots.get(id)
      if (!slot || slot.closed) return { ids: [], fields: {}, mixed: [] }
      const result = await request(slot, { type: 'selection', requestId: nextRequestId() })
      return result.ok && result.selection ? result.selection : { ids: [], fields: {}, mixed: [] }
    },
    async spatialIndex(id): Promise<BoundsEntry[]> {
      const slot = slots.get(id)
      if (!slot || slot.closed) return []
      const result = await request(slot, { type: 'spatial', requestId: nextRequestId() })
      return result.ok && result.spatial ? result.spatial : []
    },
    onFrame(listener) {
      frameListeners.add(listener)
      return () => {
        frameListeners.delete(listener)
      }
    },
    onTile(listener) {
      tileListeners.add(listener)
      return () => {
        tileListeners.delete(listener)
      }
    },
    async viewport(id): Promise<ViewportSummary> {
      const slot = slots.get(id)
      if (!slot || slot.closed)
        return { pageId: null, zoom: 1, panX: 0, panY: 0, width: 0, height: 0 }
      const result = await request(slot, { type: 'viewport', requestId: nextRequestId() })
      return result.ok && result.viewport
        ? result.viewport
        : { pageId: null, zoom: 1, panX: 0, panY: 0, width: 0, height: 0 }
    },
    subscribe(id, listener) {
      const slot = slots.get(id)
      if (!slot) return () => undefined
      slot.listeners.add(listener)
      return () => {
        slot.listeners.delete(listener)
      }
    },
    async crash(id) {
      const slot = slots.get(id)
      if (!slot || slot.closed) return
      if (slot.recovery) {
        await slot.recovery
        return
      }
      slot.restarting = true
      const exited = new Promise<void>((resolve) => {
        slot.exitWaiters.push(resolve)
      })
      slot.runtime.kill()
      await exited
      slot.restarting = false
      await startRecovery(slot)
    },
    async enqueue(job) {
      await waitForJob()
      jobsRunning += 1
      jobSequence += 1
      const id = job.id ?? `job-${jobSequence}`
      activeJobs.add(id)
      return { id, accepted: true }
    },
    completeJob(id) {
      if (!activeJobs.delete(id)) return
      jobsRunning = Math.max(0, jobsRunning - 1)
      const next = jobWaiters.shift()
      if (next) next()
    },
    async exportBytes(id) {
      const slot = slots.get(id)
      if (!slot || slot.closed) throw new Error('missing-document')
      const result = await request(slot, { type: 'export', requestId: nextRequestId() })
      if (!result.ok || result.bytes === undefined) {
        throw new Error(result.reason ?? 'export failed')
      }
      const bytes = decodeBytes(result.bytes)
      if (!bytes) throw new Error('export failed')
      return bytes
    },
    async shutdown() {
      for (const slot of slots.values()) {
        slot.closed = true
        failPending(slot, 'missing-document')
        slot.runtime.kill()
      }
      slots.clear()
      waiters.splice(0)
    }
  }
}

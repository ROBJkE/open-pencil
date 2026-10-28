import { documentProcessCap, JOB_POOL_CAP } from './caps'
import type { DocumentEngine, EngineFactory } from './engine'
import {
  isMutation,
  type ApplyResult,
  type Command,
  type JobAck,
  type JobRequest,
  type LayerTreeQuery,
  type LayerTreeWindow,
  type OpenDocumentSpec,
  type SelectionProperties,
  type SessionEvent,
  type ViewportSummary,
  type WorkPriority
} from './schema'

interface Slot {
  engine: DocumentEngine
  readOnly: boolean
  listeners: Set<(event: SessionEvent) => void>
}

export interface ProcessSupervisor {
  readonly documentCap: number
  readonly jobCap: number
  open(spec: OpenDocumentSpec): Promise<string>
  close(id: string): Promise<void>
  submit(id: string, command: Command, priority: WorkPriority): Promise<ApplyResult>
  layerTree(id: string, query: LayerTreeQuery): Promise<LayerTreeWindow>
  selection(id: string): Promise<SelectionProperties>
  viewport(id: string): Promise<ViewportSummary>
  subscribe(id: string, listener: (event: SessionEvent) => void): () => void
  crash(id: string): Promise<void>
  enqueue(job: JobRequest): Promise<JobAck>
  completeJob(id: string): void
  shutdown(): Promise<void>
}

export interface SupervisorOptions {
  factory: EngineFactory
  cpuCount?: number
  jobCap?: number
}

export function createInMemorySupervisor(options: SupervisorOptions): ProcessSupervisor {
  const documentCap = documentProcessCap(options.cpuCount ?? 2)
  const jobCap = options.jobCap ?? JOB_POOL_CAP
  const slots = new Map<string, Slot>()
  const waiters: Array<() => void> = []
  let jobsRunning = 0
  const jobWaiters: Array<() => void> = []
  const activeJobs = new Set<string>()
  let jobSequence = 0

  function emit(id: string, event: SessionEvent): void {
    const slot = slots.get(id)
    if (!slot) return
    for (const listener of slot.listeners) listener(event)
  }

  function releaseDocument(): void {
    const next = waiters.shift()
    if (next) next()
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

  function openEngine(spec: OpenDocumentSpec): Slot {
    const engine = options.factory.open(spec)
    const slot: Slot = { engine, readOnly: spec.readOnly === true, listeners: new Set() }
    slots.set(engine.id, slot)
    return slot
  }

  return {
    documentCap,
    jobCap,
    async open(spec) {
      if (slots.size >= documentCap) await waitForDocument()
      const slot = openEngine(spec)
      return slot.engine.id
    },
    async close(id) {
      const slot = slots.get(id)
      if (!slot) return
      slot.engine.dispose()
      slots.delete(id)
      releaseDocument()
    },
    async submit(id, command, _priority) {
      const slot = slots.get(id)
      if (!slot) {
        return { ack: { accepted: false, sequence: 0, reason: 'missing-document' }, events: [] }
      }
      if (slot.readOnly && isMutation(command)) {
        return { ack: { accepted: false, sequence: 0, reason: 'read-only' }, events: [] }
      }
      try {
        const result = slot.engine.apply(command)
        for (const event of result.events) emit(id, event)
        return result
      } catch (error) {
        await this.crash(id)
        const message = error instanceof Error ? error.message : 'document process failed'
        return { ack: { accepted: false, sequence: 0, reason: message }, events: [] }
      }
    },
    async layerTree(id, query) {
      const slot = slots.get(id)
      if (!slot)
        return {
          parentId: query.parentId,
          offset: query.offset,
          limit: query.limit,
          rows: [],
          total: 0
        }
      return slot.engine.readLayerTree(query)
    },
    async selection(id) {
      const slot = slots.get(id)
      if (!slot) return { ids: [], fields: {}, mixed: [] }
      return slot.engine.readSelection()
    },
    async viewport(id) {
      const slot = slots.get(id)
      if (!slot) return { pageId: null, zoom: 1, panX: 0, panY: 0, width: 0, height: 0 }
      return slot.engine.readViewport()
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
      if (!slot) return
      const checkpoint = slot.engine.checkpoint()
      const spec: OpenDocumentSpec = { id, name: slot.engine.name, readOnly: slot.readOnly }
      emit(id, { type: 'crashed', documentId: id })
      slot.engine.dispose()
      const restarted = options.factory.open(spec)
      restarted.restore(checkpoint)
      slot.engine = restarted
      emit(id, { type: 'recovered', documentId: id })
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
    async shutdown() {
      for (const slot of slots.values()) slot.engine.dispose()
      slots.clear()
      waiters.splice(0)
    }
  }
}

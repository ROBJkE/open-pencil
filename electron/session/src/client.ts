import { assertPayloadWithinCap, clampLayerLimit } from './caps'
import type {
  Command,
  CommandAck,
  LayerTreeQuery,
  LayerTreeWindow,
  SelectionProperties,
  SessionEvent,
  ViewportSummary,
  WorkPriority
} from './schema'
import {
  createInMemorySupervisor,
  type ProcessSupervisor,
  type SupervisorOptions
} from './supervisor'

export interface SessionClient {
  readonly supervisor: ProcessSupervisor
  openDocument(spec: {
    id?: string
    name: string
    readOnly?: boolean
    bytes?: Uint8Array
  }): Promise<string>
  closeDocument(id: string): Promise<void>
  submit(id: string, command: Command, priority?: WorkPriority): Promise<CommandAck>
  layerTree(id: string, query: LayerTreeQuery): Promise<LayerTreeWindow>
  selection(id: string): Promise<SelectionProperties>
  viewport(id: string): Promise<ViewportSummary>
  subscribe(id: string, listener: (event: SessionEvent) => void): () => void
}

export function createSessionClient(supervisor: ProcessSupervisor): SessionClient {
  return {
    supervisor,
    openDocument(spec) {
      return supervisor.open(spec)
    },
    closeDocument(id) {
      return supervisor.close(id)
    },
    async submit(id, command, priority = 'interaction') {
      assertPayloadWithinCap(command)
      const result = await supervisor.submit(id, command, priority)
      return result.ack
    },
    layerTree(id, query) {
      return supervisor.layerTree(id, {
        parentId: query.parentId,
        offset: Math.max(0, Math.floor(query.offset)),
        limit: clampLayerLimit(query.limit)
      })
    },
    selection(id) {
      return supervisor.selection(id)
    },
    viewport(id) {
      return supervisor.viewport(id)
    },
    subscribe(id, listener) {
      return supervisor.subscribe(id, listener)
    }
  }
}

export interface LocalSession {
  client: SessionClient
  supervisor: ProcessSupervisor
}

export function createLocalSession(options: SupervisorOptions): LocalSession {
  const supervisor = createInMemorySupervisor(options)
  return { client: createSessionClient(supervisor), supervisor }
}

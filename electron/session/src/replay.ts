import { createLocalSession } from './client'
import type { SessionClient } from './client'
import type { DocumentEngine } from './engine'
import type {
  ApplyResult,
  BoundsEntry,
  Checkpoint,
  Command,
  LayerTreeWindow,
  OpenDocumentSpec,
  SelectionProperties,
  ViewportSummary
} from './schema'

export interface ReplayProjection {
  layerTree: LayerTreeWindow
  selection: SelectionProperties
  viewport: ViewportSummary
}

export interface ReplaySession {
  client: SessionClient
  commands: Command[]
  showFrame(index: number): void
}

const EMPTY_VIEWPORT: ViewportSummary = {
  pageId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  width: 0,
  height: 0
}

function emptyProjection(): ReplayProjection {
  return {
    layerTree: { parentId: null, offset: 0, limit: 0, rows: [], total: 0 },
    selection: { ids: [], fields: {}, mixed: [] },
    viewport: EMPTY_VIEWPORT
  }
}

function createReplayEngine(
  spec: OpenDocumentSpec,
  projection: () => ReplayProjection,
  commands: Command[]
): DocumentEngine {
  let disposed = false
  const checkpoint: Checkpoint = {
    version: 1,
    nodes: [],
    rootIds: [],
    selection: [],
    hoverId: null,
    tool: 'select',
    viewport: EMPTY_VIEWPORT,
    expanded: [],
    entries: [],
    undone: 0
  }
  return {
    id: spec.id ?? crypto.randomUUID(),
    name: spec.name,
    apply(command): ApplyResult {
      if (disposed) return { ack: { accepted: false, sequence: 0, reason: 'disposed' }, events: [] }
      commands.push(command)
      return { ack: { accepted: true, sequence: commands.length }, events: [] }
    },
    readLayerTree(query) {
      const frame = projection().layerTree
      const offset = Math.max(0, query.offset)
      return {
        ...frame,
        parentId: query.parentId,
        offset,
        limit: query.limit,
        rows: frame.rows.slice(offset, offset + query.limit)
      }
    },
    readSelection() {
      return projection().selection
    },
    readViewport() {
      return projection().viewport
    },
    readSpatialIndex(): BoundsEntry[] {
      return []
    },
    checkpoint() {
      return checkpoint
    },
    restore() {
      return undefined
    },
    dispose() {
      disposed = true
    }
  }
}

/** Session client backed by recorded projections. UI work does not wait on the engine. */
export function createReplayClient(frames: readonly ReplayProjection[]): ReplaySession {
  const commands: Command[] = []
  let frameIndex = 0
  const current = (): ReplayProjection => frames[frameIndex] ?? emptyProjection()
  const { client } = createLocalSession({
    cpuCount: 2,
    factory: {
      open(spec) {
        return createReplayEngine(spec, current, commands)
      }
    }
  })
  return {
    client,
    commands,
    showFrame(index: number) {
      frameIndex = Math.max(0, Math.min(index, Math.max(frames.length - 1, 0)))
    }
  }
}

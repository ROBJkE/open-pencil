import type {
  ApplyResult,
  Checkpoint,
  DocumentEngine,
  LayerTreeQuery,
  OpenDocumentSpec
} from '@open-pencil/session'

const viewport = {
  pageId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  width: 0,
  height: 0
}

export function createFakeEngine(spec: OpenDocumentSpec): DocumentEngine {
  let steps = 0
  return {
    id: spec.id && spec.id.length > 0 ? spec.id : crypto.randomUUID(),
    name: spec.name,
    apply(): ApplyResult {
      steps += 1
      return { ack: { accepted: true, sequence: steps }, events: [] }
    },
    readLayerTree(query: LayerTreeQuery) {
      return {
        parentId: query.parentId,
        offset: query.offset,
        limit: query.limit,
        rows: [],
        total: steps
      }
    },
    readSelection: () => ({ ids: [], fields: {}, mixed: [] }),
    readViewport: () => ({ ...viewport }),
    readSpatialIndex: () => [],
    checkpoint: (): Checkpoint => ({
      version: 1,
      nodes: [],
      rootIds: [],
      selection: [],
      hoverId: null,
      tool: 'select',
      viewport: { ...viewport },
      expanded: [],
      entries: [],
      undone: steps
    }),
    restore(checkpoint) {
      steps = checkpoint.undone
    },
    dispose() {
      steps = -1
    }
  }
}

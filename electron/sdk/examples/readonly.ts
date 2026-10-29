import {
  createReplayClient,
  type Command,
  type CommandAck,
  type LayerRow,
  type ReplayProjection,
  type SessionClient
} from '@open-pencil/session'

function reviewRow(id: string, name: string, depth: number): LayerRow {
  return {
    id,
    name,
    type: depth === 0 ? 'frame' : 'text',
    depth,
    childCount: depth === 0 ? 1 : 0,
    expanded: depth === 0,
    selected: false,
    visible: true
  }
}

/** Recorded projection for a read-only review surface. */
export const reviewFrames: readonly ReplayProjection[] = [
  {
    layerTree: {
      parentId: null,
      offset: 0,
      limit: 2,
      total: 2,
      rows: [reviewRow('header', 'Header', 0), reviewRow('title', 'Title', 1)]
    },
    selection: { ids: ['header'], fields: { name: 'Header', x: 4 }, mixed: [] },
    viewport: { pageId: 'header', zoom: 1, panX: 0, panY: 0, width: 800, height: 600 }
  }
]

export interface ReadonlyPreview {
  client: SessionClient
  documentId: string
  deleteAck: CommandAck
  commands: readonly Command[]
}

/** Opens a replayed document read-only and submits a delete that the session refuses. */
export async function openReadonlyPreview(): Promise<ReadonlyPreview> {
  const replay = createReplayClient(reviewFrames)
  const documentId = await replay.client.openDocument({ name: 'Review', readOnly: true })
  const deleteAck = await replay.client.submit(documentId, { type: 'delete', ids: ['header'] })
  return {
    client: replay.client,
    documentId,
    deleteAck,
    commands: replay.commands
  }
}

import type { ApplyResult, JSONValue, NodeDraft } from '@open-pencil/session'

import type { DocumentStore } from '../graph/store'

/**
 * A remote change, applied with the same document commands as a local edit.
 * Creates, moves, and field writes each become one command.
 */
export type RemoteUpdate =
  | {
      kind: 'create'
      parentId: string | null
      index: number
      node: NodeDraft
    }
  | {
      kind: 'move'
      id: string
      parentId: string | null
      index: number
    }
  | {
      kind: 'fields'
      id: string
      fields: Record<string, JSONValue>
    }

export function applyRemote(store: DocumentStore, update: RemoteUpdate): ApplyResult {
  if (update.kind === 'create') {
    return store.apply({
      type: 'create',
      parentId: update.parentId,
      index: update.index,
      node: update.node
    })
  }
  if (update.kind === 'move') {
    return store.apply({
      type: 'reparent',
      id: update.id,
      parentId: update.parentId,
      index: update.index
    })
  }
  return store.apply({
    type: 'edit',
    id: update.id,
    fields: update.fields
  })
}

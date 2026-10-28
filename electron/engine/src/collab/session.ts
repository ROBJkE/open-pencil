import * as Y from 'yjs'

import type { ApplyResult, JSONValue, NodeDraft } from '@open-pencil/session'

import type { DocumentStore } from '../graph/store'
import { bindComments, type CommentDraft, type CommentReply } from './comments'
import { integrateRemote } from './integrate'
import {
  ORDER_KEY_FIELD,
  TYPE_FIELD,
  bumpClock,
  changedFields,
  ensureNode,
  fieldsForStore,
  readSharedNodes,
  writeFields,
  writeParentEntry
} from './nodes'
import { orderKeyAt } from './order'
import { orderKeysBeside, parentKey } from './tree'

/**
 * Yjs for one document. A hidden room window owns WebRTC and forwards only bytes.
 * Remote bytes are applied here as document commands. Undo stays a local command.
 */

export interface CollabSession {
  readonly store: DocumentStore
  /** Bytes the room window forwards to the other peers. */
  encodeUpdate(): Uint8Array
  /** Applies bytes the room window forwarded from a peer. */
  applyForwarded(bytes: Uint8Array): void
  create(node: NodeDraft, parentId: string | null, index: number): ApplyResult
  edit(id: string, fields: Record<string, JSONValue>): ApplyResult
  move(id: string, parentId: string | null, index: number): ApplyResult
  writeThread(threadId: string, draft: CommentDraft): ApplyResult
  addReply(threadId: string, reply: CommentReply): ApplyResult
  destroy(): void
}

export function openCollab(store: DocumentStore): CollabSession {
  const doc = new Y.Doc()
  const nodes = doc.getMap<unknown>('nodes')
  const meta = doc.getMap<unknown>('meta')
  const comments = bindComments(doc, store)
  const onNodes: Parameters<Y.Map<unknown>['observeDeep']>[0] = (events, transaction) => {
    if (transaction.local) return
    integrateRemote(store, nodes, changedNodeIds(nodes, events))
  }
  nodes.observeDeep(onNodes)
  return {
    store,
    encodeUpdate: () => Y.encodeStateAsUpdate(doc),
    applyForwarded(bytes) {
      if (bytes.byteLength === 0) return
      Y.applyUpdate(doc, bytes)
    },
    create: (node, parentId, index) => createNode(doc, store, nodes, meta, node, parentId, index),
    edit: (id, fields) => editNode(doc, store, nodes, id, fields),
    move: (id, parentId, index) => moveNode(doc, store, nodes, meta, id, parentId, index),
    writeThread: (threadId, draft) => comments.writeThread(threadId, draft),
    addReply: (threadId, reply) => comments.addReply(threadId, reply),
    destroy() {
      nodes.unobserveDeep(onNodes)
      comments.unbind()
    }
  }
}

function changedNodeIds(
  nodes: Y.Map<unknown>,
  events: Parameters<Parameters<Y.Map<unknown>['observeDeep']>[0]>[0]
): Set<string> {
  const changed = new Set<string>()
  for (const event of events) {
    const head = event.path[0]
    if (typeof head === 'string') {
      changed.add(head)
      continue
    }
    if (event.target === nodes) {
      for (const key of event.keys.keys()) changed.add(key)
    }
  }
  return changed
}

function createNode(
  doc: Y.Doc,
  store: DocumentStore,
  nodes: Y.Map<unknown>,
  meta: Y.Map<unknown>,
  draft: NodeDraft,
  parentId: string | null,
  index: number
): ApplyResult {
  const id = draft.id
  if (id === undefined || id.length === 0) return { ack: store.fail('missing-id'), events: [] }
  const fields = draft.fields ?? {}
  const key = orderKeyAt(orderKeysBeside(readSharedNodes(nodes), parentId, id), index)
  const result = store.apply({
    type: 'create',
    parentId,
    index,
    node: draftNode(id, draft.type, fields, draft.passthrough)
  })
  if (!result.ack.accepted) return result
  doc.transact(() => {
    const ynode = ensureNode(nodes, id)
    ynode.set(TYPE_FIELD, draft.type)
    writeParentEntry(ynode, parentKey(parentId), bumpClock(meta, nodes))
    ynode.set(ORDER_KEY_FIELD, key)
    writeFields(ynode, fields)
  })
  return result
}

function editNode(
  doc: Y.Doc,
  store: DocumentStore,
  nodes: Y.Map<unknown>,
  id: string,
  fields: Record<string, JSONValue>
): ApplyResult {
  const current = store.getNode(id)
  if (!current) return store.apply({ type: 'edit', id, fields })
  const stored = fieldsForStore(current.fields, fields)
  const patch = changedFields(current.fields, stored)
  const result = patch
    ? store.apply({ type: 'edit', id, fields: patch })
    : { ack: store.succeed(), events: [] }
  if (!result.ack.accepted) return result
  const ynode = nodes.get(id)
  if (!(ynode instanceof Y.Map)) return result
  doc.transact(() => writeFields(ynode, fields))
  return result
}

function moveNode(
  doc: Y.Doc,
  store: DocumentStore,
  nodes: Y.Map<unknown>,
  meta: Y.Map<unknown>,
  id: string,
  parentId: string | null,
  index: number
): ApplyResult {
  const ynode = nodes.get(id)
  const key =
    ynode instanceof Y.Map
      ? orderKeyAt(orderKeysBeside(readSharedNodes(nodes), parentId, id), index)
      : undefined
  const result = store.apply({ type: 'reparent', id, parentId, index })
  if (!result.ack.accepted || !(ynode instanceof Y.Map) || key === undefined) return result
  doc.transact(() => {
    writeParentEntry(ynode, parentKey(parentId), bumpClock(meta, nodes))
    ynode.set(ORDER_KEY_FIELD, key)
  })
  return result
}

function draftNode(
  id: string,
  type: string,
  fields: Record<string, JSONValue>,
  passthrough: NodeDraft['passthrough']
): NodeDraft {
  const node: NodeDraft = { id, type, fields: { ...fields } }
  if (passthrough) node.passthrough = { ...passthrough }
  return node
}

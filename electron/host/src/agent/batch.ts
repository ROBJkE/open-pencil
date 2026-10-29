import type { DocumentStore } from '@open-pencil/engine'
import type { GraphNode, Operation } from '@open-pencil/session'

import type { StagedRender } from './render'

/**
 * Inserts every staged render as one history entry. Callers skip this on
 * abort and error, so a discarded side scene never becomes an undo step.
 */
export function commitRenderBatch(
  document: DocumentStore,
  groups: readonly StagedRender[]
): boolean {
  const forward: Operation[] = []
  const inverse: Operation[] = []
  const cursors = new Map<string, number>()

  for (const group of groups) {
    if (group.nodes.length === 0) continue
    const cursor = rootCursor(document, forward, cursors, group)
    if (cursor === null) return false
    appendGroup(forward, inverse, cursors, group, cursor)
  }
  if (forward.length === 0) return true
  if (repeated(document, forward)) return false
  const applied = document.applyLogged(forward, inverse.toReversed(), null)
  if (!applied.ack.accepted) return false
  for (const operation of forward) {
    if (operation.kind === 'put-node') document.expanded.add(operation.node.id)
  }
  return true
}

function appendGroup(
  forward: Operation[],
  inverse: Operation[],
  cursors: Map<string, number>,
  group: StagedRender,
  start: number
): void {
  let cursor = start
  for (const node of group.nodes) {
    const atRoot = node.parentId === group.parentId
    forward.push({ kind: 'put-node', node, index: atRoot ? cursor : 0 })
    inverse.push({ kind: 'remove-node', id: node.id })
    if (!atRoot) continue
    cursor += 1
    cursors.set(parentKey(group.parentId), cursor)
  }
}

function rootCursor(
  document: DocumentStore,
  forward: readonly Operation[],
  cursors: Map<string, number>,
  group: StagedRender
): number | null {
  const key = parentKey(group.parentId)
  const running = cursors.get(key)
  if (running !== undefined) return running
  const count = childCount(document, forward, group.parentId)
  if (count === null) return null
  const seeded = group.index ?? count
  cursors.set(key, seeded)
  return seeded
}

function childCount(
  document: DocumentStore,
  forward: readonly Operation[],
  parentId: string | null
): number | null {
  if (parentId === null) return document.rootIds.length
  const live = document.getNode(parentId)
  if (live) return live.childIds.length
  const created = inserted(forward, parentId)
  if (!created) return null
  return created.childIds.length
}

function inserted(forward: readonly Operation[], id: string): GraphNode | null {
  for (const operation of forward) {
    if (operation.kind === 'put-node' && operation.node.id === id) return operation.node
  }
  return null
}

function repeated(document: DocumentStore, forward: readonly Operation[]): boolean {
  const seen = new Set<string>()
  for (const operation of forward) {
    if (operation.kind !== 'put-node') continue
    if (seen.has(operation.node.id) || document.getNode(operation.node.id) !== undefined) {
      return true
    }
    seen.add(operation.node.id)
  }
  return false
}

function parentKey(parentId: string | null): string {
  return parentId === null ? 'root' : `id:${parentId}`
}

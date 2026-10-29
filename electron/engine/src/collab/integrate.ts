import * as Y from 'yjs'

import type { DocumentStore } from '../graph/store'
import { changedFields, readFields, readSharedNodes, readType } from './nodes'
import { applyRemote } from './remote'
import { resolvePlaces, type ResolvedPlace } from './tree'

/**
 * Reads the shared maps after a remote update and applies creates, field writes,
 * and moves through document commands. The store is the only scene graph.
 */

export function integrateRemote(
  store: DocumentStore,
  nodes: Y.Map<unknown>,
  changed: ReadonlySet<string>
): void {
  if (changed.size === 0) return
  const places = resolvePlaces(readSharedNodes(nodes))
  for (const id of missingIds(store, nodes, changed, places)) {
    const value = nodes.get(id)
    if (value instanceof Y.Map) createNode(store, value, id, places.get(id))
  }
  patchChanged(store, nodes, changed)
  placeChanged(store, changed, places)
}

function missingIds(
  store: DocumentStore,
  nodes: Y.Map<unknown>,
  changed: ReadonlySet<string>,
  places: ReadonlyMap<string, ResolvedPlace>
): string[] {
  const ids: string[] = []
  for (const id of changed) {
    if (store.getNode(id) || !places.has(id)) continue
    if (nodes.get(id) instanceof Y.Map) ids.push(id)
  }
  ids.sort(byTreePosition(places))
  return ids
}

function createNode(
  store: DocumentStore,
  ynode: Y.Map<unknown>,
  id: string,
  place: ResolvedPlace | undefined
): void {
  const parentId = place?.parentId ?? null
  const index = place?.index ?? 0
  const parentReady = parentId === null || store.getNode(parentId) !== undefined
  applyRemote(store, {
    kind: 'create',
    parentId: parentReady ? parentId : null,
    index: parentReady ? index : 0,
    node: { id, type: readType(ynode), fields: readFields(ynode) }
  })
}

function patchChanged(
  store: DocumentStore,
  nodes: Y.Map<unknown>,
  changed: ReadonlySet<string>
): void {
  for (const id of changed) {
    const node = store.getNode(id)
    const value = nodes.get(id)
    if (!node || !(value instanceof Y.Map)) continue
    const patch = changedFields(node.fields, readFields(value))
    if (!patch) continue
    applyRemote(store, { kind: 'fields', id, fields: patch })
  }
}

function placeChanged(
  store: DocumentStore,
  changed: ReadonlySet<string>,
  places: ReadonlyMap<string, ResolvedPlace>
): void {
  const ids = [...changed].filter((id) => places.has(id) && store.getNode(id) !== undefined)
  ids.sort(byTreePosition(places))
  for (const id of ids) {
    const place = places.get(id)
    if (!place) continue
    if (place.parentId !== null && store.getNode(place.parentId) === undefined) continue
    if (samePlace(store, id, place.parentId, place.index)) continue
    applyRemote(store, { kind: 'move', id, parentId: place.parentId, index: place.index })
  }
}

function samePlace(
  store: DocumentStore,
  id: string,
  parentId: string | null,
  index: number
): boolean {
  const node = store.getNode(id)
  if (!node || node.parentId !== parentId) return false
  const ids = parentId === null ? store.rootIds : (store.getNode(parentId)?.childIds ?? [])
  return ids[index] === id
}

function byTreePosition(places: ReadonlyMap<string, ResolvedPlace>) {
  return (left: string, right: string): number => {
    const depth = depthOf(left, places) - depthOf(right, places)
    if (depth !== 0) return depth
    const parents = parentRank(
      places.get(left)?.parentId ?? null,
      places.get(right)?.parentId ?? null
    )
    if (parents !== 0) return parents
    return (places.get(left)?.index ?? 0) - (places.get(right)?.index ?? 0)
  }
}

function parentRank(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return -1
  if (right === null) return 1
  return left < right ? -1 : 1
}

function depthOf(id: string, places: ReadonlyMap<string, ResolvedPlace>): number {
  let depth = 0
  let parent = places.get(id)?.parentId ?? null
  const seen = new Set<string>([id])
  while (parent !== null && !seen.has(parent)) {
    seen.add(parent)
    depth += 1
    parent = places.get(parent)?.parentId ?? null
  }
  return depth
}

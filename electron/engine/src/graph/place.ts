import {
  isLayerContainer,
  type GraphNode,
  type JSONValue,
  type LayerDropPosition,
  type Operation
} from '@open-pencil/session'

import { indexOf, isAncestor, siblings, type GraphTables } from './mutate'
import { ancestorBoxes, localKeepingOrigin, type PlacedNode } from './placement'

export interface PlaceEdits {
  ok: true
  forward: Operation[]
  inverse: Operation[]
  expandId: string | null
}

interface PlaceRefusal {
  ok: false
  error: string
}

interface Slot {
  ok: true
  parentId: string | null
  index: number
}

function finite(value: JSONValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readNode(tables: GraphTables): (id: string) => PlacedNode | undefined {
  return (id) => tables.nodes.get(id)
}

/**
 * Index among `ids` counted without `sourceId`, so a layer dragged from earlier in the same
 * parent lands one slot sooner.
 */
function dropIndex(ids: readonly string[], sourceId: string, index: number): number {
  const sourceIndex = ids.indexOf(sourceId)
  return sourceIndex !== -1 && sourceIndex < index ? index - 1 : index
}

function intoSlot(tables: GraphTables, id: string, target: GraphNode): Slot | PlaceRefusal {
  if (!isLayerContainer(target.type)) return { ok: false, error: 'not-container' }
  if (isAncestor(tables, id, target.id)) return { ok: false, error: 'cycle' }
  return {
    ok: true,
    parentId: target.id,
    index: dropIndex(target.childIds, id, target.childIds.length)
  }
}

function besideSlot(
  tables: GraphTables,
  id: string,
  target: GraphNode,
  position: Exclude<LayerDropPosition, 'into'>
): Slot | PlaceRefusal {
  const parentId = target.parentId
  if (parentId === id || isAncestor(tables, id, parentId)) return { ok: false, error: 'cycle' }
  const list = siblings(tables, parentId)
  if (!list) return { ok: false, error: 'missing-parent' }
  const targetIndex = list.indexOf(target.id)
  if (targetIndex === -1) return { ok: false, error: 'missing-node' }
  const at = position === 'before' ? targetIndex : targetIndex + 1
  return { ok: true, parentId, index: dropIndex(list, id, at) }
}

function destination(
  tables: GraphTables,
  id: string,
  target: GraphNode,
  position: LayerDropPosition
): Slot | PlaceRefusal {
  return position === 'into'
    ? intoSlot(tables, id, target)
    : besideSlot(tables, id, target, position)
}

function shiftedOrigin(tables: GraphTables, node: GraphNode, parentId: string | null) {
  const x = finite(node.fields.x)
  const y = finite(node.fields.y)
  if (x === null || y === null) return null
  const next = localKeepingOrigin(
    ancestorBoxes(node.parentId, readNode(tables)),
    ancestorBoxes(parentId, readNode(tables)),
    x,
    y
  )
  if (!next || (next.x === x && next.y === y)) return null
  return { previous: { x, y }, next }
}

/**
 * One undo step for a layers-panel drop.
 * A parent change keeps the layer's world origin. `reparent` does not, so a remote move and its
 * field write are not shifted twice.
 */
export function planPlace(
  tables: GraphTables,
  id: string,
  targetId: string,
  position: LayerDropPosition
): PlaceEdits | PlaceRefusal {
  const node = tables.nodes.get(id)
  const target = tables.nodes.get(targetId)
  if (!node || !target) return { ok: false, error: 'missing-node' }
  if (id === targetId) return { ok: false, error: 'cycle' }

  const slot = destination(tables, id, target, position)
  if (!slot.ok) return slot

  const expandId = position === 'into' ? targetId : null
  const previousIndex = indexOf(tables, node)
  if (node.parentId === slot.parentId && previousIndex === slot.index) {
    return { ok: true, forward: [], inverse: [], expandId }
  }

  const forward: Operation[] = [{ kind: 'move', id, parentId: slot.parentId, index: slot.index }]
  const inverse: Operation[] = [{ kind: 'move', id, parentId: node.parentId, index: previousIndex }]
  if (node.parentId !== slot.parentId) {
    const shift = shiftedOrigin(tables, node, slot.parentId)
    if (shift) {
      forward.push({ kind: 'patch-fields', id, fields: { x: shift.next.x, y: shift.next.y } })
      inverse.unshift({ kind: 'patch-fields', id, fields: shift.previous })
    }
  }
  return { ok: true, forward, inverse, expandId }
}

import type { GraphNode } from '@open-pencil/session'

/**
 * Nodes a dirty edit recomputes: each dirty node and its descendants.
 * Ancestors and sibling branches stay out, so one leaf does not pull in an
 * unrelated subtree.
 */
export function dirtySubtreeIds(
  nodes: readonly GraphNode[],
  dirtyIds: readonly string[]
): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const dirty = new Set<string>()
  for (const id of dirtyIds) {
    if (byId.has(id)) dirty.add(id)
  }

  const roots: string[] = []
  const listed = new Set<string>()
  for (const id of dirtyIds) {
    if (!dirty.has(id) || listed.has(id) || hasDirtyAncestor(byId, id, dirty)) continue
    listed.add(id)
    roots.push(id)
  }

  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of roots) collect(byId, id, ids, seen)
  return ids
}

function hasDirtyAncestor(
  byId: ReadonlyMap<string, GraphNode>,
  id: string,
  dirty: ReadonlySet<string>
): boolean {
  const seen = new Set<string>()
  let parentId = byId.get(id)?.parentId ?? null
  while (parentId !== null) {
    if (seen.has(parentId)) return false
    seen.add(parentId)
    if (dirty.has(parentId)) return true
    parentId = byId.get(parentId)?.parentId ?? null
  }
  return false
}

function collect(
  byId: ReadonlyMap<string, GraphNode>,
  id: string,
  into: string[],
  seen: Set<string>
): void {
  if (seen.has(id)) return
  const node = byId.get(id)
  if (!node) return
  seen.add(id)
  into.push(id)
  for (const childId of node.childIds) collect(byId, childId, into, seen)
}

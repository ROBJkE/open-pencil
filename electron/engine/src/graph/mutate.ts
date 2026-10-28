import type {
  BoundsEntry,
  GraphNode,
  JSONValue,
  Operation,
  SessionEvent
} from '@open-pencil/session'

export type BagName = 'variables' | 'comments' | 'lintDismissals' | 'shaders' | 'libraries'

export interface GraphTables {
  readonly id: string
  nodes: Map<string, GraphNode>
  rootIds: string[]
  selection: Set<string>
  expanded: Set<string>
  preview: Map<string, Record<string, JSONValue>>
  bags: Record<BagName, Record<string, JSONValue>>
  hoverId: string | null
  generation: number
}

export function cloneNode(node: GraphNode): GraphNode {
  return structuredClone(node)
}

export function omitKey(record: Record<string, JSONValue>, key: string): Record<string, JSONValue> {
  const next: Record<string, JSONValue> = {}
  for (const [name, value] of Object.entries(record)) {
    if (name !== key) next[name] = value
  }
  return next
}

export function siblings(tables: GraphTables, parentId: string | null): string[] | null {
  if (parentId === null) return tables.rootIds
  return tables.nodes.get(parentId)?.childIds ?? null
}

export function indexOf(tables: GraphTables, node: GraphNode): number {
  const list = siblings(tables, node.parentId) ?? []
  const index = list.indexOf(node.id)
  return index === -1 ? list.length : index
}

export function subtree(tables: GraphTables, id: string): GraphNode[] {
  const node = tables.nodes.get(id)
  if (!node) return []
  return [cloneNode(node), ...node.childIds.flatMap((childId) => subtree(tables, childId))]
}

export function isAncestor(tables: GraphTables, id: string, parentId: string | null): boolean {
  let current = parentId
  while (current !== null) {
    if (current === id) return true
    current = tables.nodes.get(current)?.parentId ?? null
  }
  return false
}

export function applyOps(
  tables: GraphTables,
  operations: readonly Operation[],
  touched: string[],
  removed: string[]
): void {
  for (const operation of operations) applyOp(tables, operation, touched, removed)
}

function applyOp(
  tables: GraphTables,
  operation: Operation,
  touched: string[],
  removed: string[]
): void {
  switch (operation.kind) {
    case 'put-node':
      putNode(tables, operation.node, operation.index)
      touched.push(operation.node.id)
      return
    case 'remove-node':
      dropNode(tables, operation.id)
      removed.push(operation.id)
      return
    case 'patch-fields':
      patchFields(tables, operation.id, operation.fields)
      touched.push(operation.id)
      return
    case 'move':
      relocate(tables, operation.id, operation.parentId, operation.index)
      touched.push(operation.id)
      return
    case 'patch-bag':
      patchBag(tables, operation.bag, operation.key, operation.value)
  }
}

function putNode(tables: GraphTables, node: GraphNode, index: number): void {
  const copy = cloneNode(node)
  tables.nodes.set(copy.id, copy)
  const list = siblings(tables, copy.parentId)
  if (!list || list.includes(copy.id)) return
  list.splice(Math.min(Math.max(0, index), list.length), 0, copy.id)
}

function dropNode(tables: GraphTables, id: string): void {
  const node = tables.nodes.get(id)
  if (!node) return
  const list = siblings(tables, node.parentId)
  const index = list?.indexOf(id) ?? -1
  if (list && index !== -1) list.splice(index, 1)
  tables.nodes.delete(id)
  tables.selection.delete(id)
  tables.expanded.delete(id)
  tables.preview.delete(id)
  if (tables.hoverId === id) tables.hoverId = null
}

function patchFields(
  tables: GraphTables,
  id: string,
  fields: Record<string, JSONValue | null>
): void {
  const node = tables.nodes.get(id)
  if (!node) return
  for (const [key, value] of Object.entries(fields)) {
    node.fields = value === null ? omitKey(node.fields, key) : { ...node.fields, [key]: value }
  }
}

function patchBag(tables: GraphTables, bag: BagName, key: string, value: JSONValue | null): void {
  tables.bags[bag] =
    value === null ? omitKey(tables.bags[bag], key) : { ...tables.bags[bag], [key]: value }
}

function relocate(tables: GraphTables, id: string, parentId: string | null, index: number): void {
  const node = tables.nodes.get(id)
  if (!node) return
  const from = siblings(tables, node.parentId)
  const current = from?.indexOf(id) ?? -1
  if (from && current !== -1) from.splice(current, 1)
  node.parentId = parentId
  const to = siblings(tables, parentId)
  if (!to || to.includes(id)) return
  to.splice(Math.min(Math.max(0, index), to.length), 0, id)
}

export function spatialEvent(
  tables: GraphTables,
  boundsFor: (node: GraphNode) => BoundsEntry | null,
  touched: readonly string[],
  removed: readonly string[]
): SessionEvent[] {
  const upsert: BoundsEntry[] = []
  for (const id of touched) {
    const node = tables.nodes.get(id)
    if (!node) continue
    const bounds = boundsFor(node)
    if (bounds) upsert.push(bounds)
  }
  const gone = removed.filter((id) => !tables.nodes.has(id))
  if (upsert.length === 0 && gone.length === 0) return []
  tables.generation += 1
  return [
    {
      type: 'spatial',
      documentId: tables.id,
      delta: { generation: tables.generation, upsert, remove: gone }
    }
  ]
}

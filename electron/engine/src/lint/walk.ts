import type { GraphNode } from '@open-pencil/session'

import type { LintContext } from './types'

export function indexGraph(nodes: readonly GraphNode[]): {
  nodes: ReadonlyMap<string, GraphNode>
  roots: readonly string[]
} {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const known = new Set(byId.keys())
  const roots: string[] = []
  for (const node of nodes) {
    if (node.parentId === null || !known.has(node.parentId)) roots.push(node.id)
  }
  return { nodes: byId, roots }
}

export function parentOf(
  nodes: ReadonlyMap<string, GraphNode>,
  node: GraphNode
): GraphNode | undefined {
  if (node.parentId === null) return undefined
  return nodes.get(node.parentId)
}

export function childrenOf(
  nodes: ReadonlyMap<string, GraphNode>,
  node: GraphNode
): GraphNode[] {
  const children: GraphNode[] = []
  for (const id of node.childIds) {
    const child = nodes.get(id)
    if (child) children.push(child)
  }
  return children
}

/** Ancestors, nearest first. */
export function ancestorsOf(
  nodes: ReadonlyMap<string, GraphNode>,
  node: GraphNode
): GraphNode[] {
  const ancestors: GraphNode[] = []
  const seen = new Set<string>([node.id])
  let parentId = node.parentId
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = nodes.get(parentId)
    if (!parent) break
    ancestors.push(parent)
    parentId = parent.parentId
  }
  return ancestors
}

export function siblingIds(context: LintContext, node: GraphNode): readonly string[] {
  if (node.parentId === null) return context.roots
  return context.nodes.get(node.parentId)?.childIds ?? []
}

/** Siblings painted under `node`, topmost first. */
export function siblingsBelow(context: LintContext, node: GraphNode): GraphNode[] {
  const ids = siblingIds(context, node)
  const index = ids.indexOf(node.id)
  const below = index === -1 ? [] : ids.slice(0, index).toReversed()
  const siblings: GraphNode[] = []
  for (const id of below) {
    const sibling = context.nodes.get(id)
    if (sibling) siblings.push(sibling)
  }
  return siblings
}

export function insideInstance(node: GraphNode, nodes: ReadonlyMap<string, GraphNode>): boolean {
  const seen = new Set<string>([node.id])
  let parentId = node.parentId
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = nodes.get(parentId)
    if (!parent) return false
    if (parent.type === 'ref') return true
    parentId = parent.parentId
  }
  return false
}

const COMPONENT_TYPES = new Set(['component', 'component_set', 'ref'])

/** A layer inside a component or an instance, whose structure is not the user's to delete. */
export function inComponentTree(node: GraphNode, nodes: ReadonlyMap<string, GraphNode>): boolean {
  for (const ancestor of ancestorsOf(nodes, node)) {
    if (ancestor.fields.reusable === true || COMPONENT_TYPES.has(ancestor.type)) return true
  }
  return false
}

export function nodePath(node: GraphNode, nodes: ReadonlyMap<string, GraphNode>): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  let current: GraphNode | undefined = node
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    names.push(layerName(current))
    current = current.parentId === null ? undefined : nodes.get(current.parentId)
  }
  return names.toReversed()
}

export function layerName(node: GraphNode): string {
  const name = node.fields.name
  if (typeof name === 'string' && name.length > 0) return name
  return node.type
}

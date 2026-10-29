import type { GraphNode } from '@open-pencil/session'

import type { LintContext, NodeChange } from './types'
import { siblingIds } from './walk'

const FAMILY_FIELDS = new Set([
  'name',
  'x',
  'y',
  'width',
  'height',
  'layout',
  'gap',
  'padding',
  'layoutPosition',
  'justifyContent',
  'alignItems',
  'fill',
  'ref',
  'reusable',
  'textGrowth',
  'rotation'
])

const CONTRAST_FIELDS = new Set([
  'fill',
  'opacity',
  'enabled',
  'fontSize',
  'fontWeight',
  'content',
  'styleRuns',
  'x',
  'y',
  'width',
  'height',
  'rotation'
])

const BACKDROP_FIELDS = new Set(['fill', 'opacity', 'enabled'])

const COVERAGE_FIELDS = new Set([
  'fill',
  'opacity',
  'enabled',
  'x',
  'y',
  'width',
  'height',
  'rotation'
])

const TEXT_TYPES = new Set(['text', 'icon_font'])

/**
 * Layers to run again after `change`. The graph in `context` is the graph after the change.
 * Open, variable, and config changes are not node changes: use `lintDocument` for those.
 */
export function recheckIds(change: NodeChange, context: LintContext): readonly string[] {
  const into: string[] = []
  const seen = new Set<string>()
  if (change.kind === 'edit') recheckEdit(change, context, into, seen)
  else if (change.kind === 'move') recheckMove(change, context, into, seen)
  else recheckStructure(change.id, context, into, seen)
  return into
}

function recheckEdit(
  change: Extract<NodeChange, { kind: 'edit' }>,
  context: LintContext,
  into: string[],
  seen: Set<string>
): void {
  add(into, seen, change.id)
  const node = context.nodes.get(change.id)
  if (change.fields.some((field) => FAMILY_FIELDS.has(field))) {
    addFamily(change.id, context, into, seen)
  }
  if (!node || !change.fields.some((field) => CONTRAST_FIELDS.has(field))) return
  addAncestors(node, context, into, seen)
  addSiblingsBelow(node, context, into, seen)
  if (change.fields.some((field) => BACKDROP_FIELDS.has(field))) {
    addTextInside(node, context, into, seen)
  }
  if (change.fields.some((field) => COVERAGE_FIELDS.has(field))) {
    addTextAbove(node, context, into, seen)
  }
}

function recheckMove(
  change: Extract<NodeChange, { kind: 'move' }>,
  context: LintContext,
  into: string[],
  seen: Set<string>
): void {
  addSubtree(change.id, context, into, seen)
  addFamily(change.id, context, into, seen)
  const node = context.nodes.get(change.id)
  if (node) {
    addAncestors(node, context, into, seen)
    addSiblingsBelow(node, context, into, seen)
    addTextInside(node, context, into, seen)
    addTextAbove(node, context, into, seen)
  }
  if (change.fromParentId === undefined) return
  if (change.fromParentId === null) {
    for (const id of context.roots) add(into, seen, id)
    return
  }
  addFamily(change.fromParentId, context, into, seen)
  const previous = context.nodes.get(change.fromParentId)
  if (previous) addTextInside(previous, context, into, seen)
}

function recheckStructure(
  id: string | null,
  context: LintContext,
  into: string[],
  seen: Set<string>
): void {
  if (id === null) {
    for (const rootId of context.roots) add(into, seen, rootId)
    return
  }
  add(into, seen, id)
  addFamily(id, context, into, seen)
  const node = context.nodes.get(id)
  if (!node) return
  addTextInside(node, context, into, seen)
}

function add(into: string[], seen: Set<string>, id: string | null): void {
  if (id === null || seen.has(id)) return
  seen.add(id)
  into.push(id)
}

function addFamily(id: string, context: LintContext, into: string[], seen: Set<string>): void {
  const node = context.nodes.get(id)
  if (!node) return
  add(into, seen, node.parentId)
  for (const childId of node.childIds) add(into, seen, childId)
}

function addAncestors(node: GraphNode, context: LintContext, into: string[], seen: Set<string>): void {
  const walked = new Set<string>([node.id])
  let parentId = node.parentId
  while (parentId !== null && !walked.has(parentId)) {
    walked.add(parentId)
    add(into, seen, parentId)
    parentId = context.nodes.get(parentId)?.parentId ?? null
  }
}

function addSiblingsBelow(
  node: GraphNode,
  context: LintContext,
  into: string[],
  seen: Set<string>
): void {
  const ids = siblingIds(context, node)
  const index = ids.indexOf(node.id)
  const below = index === -1 ? [] : ids.slice(0, index)
  for (const id of below) add(into, seen, id)
}

function addSubtree(id: string, context: LintContext, into: string[], seen: Set<string>): void {
  const walked = new Set<string>()
  const visit = (currentId: string): void => {
    if (walked.has(currentId)) return
    walked.add(currentId)
    add(into, seen, currentId)
    const current = context.nodes.get(currentId)
    if (!current || current.type === 'ref') return
    for (const childId of current.childIds) visit(childId)
  }
  visit(id)
}

function addTextInside(node: GraphNode, context: LintContext, into: string[], seen: Set<string>): void {
  if (node.type === 'ref') return
  for (const childId of node.childIds) addTextTree(childId, context, into, seen)
}

function addTextAbove(node: GraphNode, context: LintContext, into: string[], seen: Set<string>): void {
  const ids = siblingIds(context, node)
  const index = ids.indexOf(node.id)
  const above = index === -1 ? [] : ids.slice(index + 1)
  for (const id of above) addTextTree(id, context, into, seen)
}

function addTextTree(id: string, context: LintContext, into: string[], seen: Set<string>): void {
  const walked = new Set<string>()
  const visit = (currentId: string): void => {
    if (walked.has(currentId)) return
    walked.add(currentId)
    const current = context.nodes.get(currentId)
    if (!current) return
    if (TEXT_TYPES.has(current.type)) add(into, seen, currentId)
    if (current.type === 'ref') return
    for (const childId of current.childIds) visit(childId)
  }
  visit(id)
}

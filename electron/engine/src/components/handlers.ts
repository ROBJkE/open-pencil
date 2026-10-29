import type { ApplyResult, Command, GraphNode, JSONValue } from '@open-pencil/session'

import type { CommandHandler, DocumentStore } from '../graph/store'

const DESCENDANTS = 'descendants'

/**
 * Instance commands the built-in dispatcher leaves unimplemented.
 * Creating a component, editing a variable, binding a field, and importing a
 * library stay on those built-ins: a variable edit writes one bag record, and
 * a library import stores the path it was given.
 */
export const componentHandlers: readonly CommandHandler[] = [
  { command: 'reset-override', apply: resetOverride },
  { command: 'swap-variant', apply: swapVariant }
]

function resetOverride(document: DocumentStore, command: Command): ApplyResult | null {
  if (command.type !== 'reset-override') return null
  const current = document.getNode(command.id)
  if (!current) return { ack: document.fail('missing-node'), events: [] }
  if (!hasDescendants(current)) return { ack: document.succeed(), events: [] }
  const next = withoutDescendants(current)
  const index = placement(document, current)
  return document.applyLogged(
    [{ kind: 'put-node', node: next, index }],
    [{ kind: 'put-node', node: current, index }],
    null
  )
}

function swapVariant(document: DocumentStore, command: Command): ApplyResult | null {
  if (command.type !== 'swap-variant') return null
  return document.editFields(command.id, command.properties, null)
}

function hasDescendants(node: GraphNode): boolean {
  return Object.hasOwn(node.fields, DESCENDANTS) || Object.hasOwn(node.passthrough, DESCENDANTS)
}

function withoutDescendants(node: GraphNode): GraphNode {
  return {
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    childIds: [...node.childIds],
    fields: omit(node.fields, DESCENDANTS),
    passthrough: omit(node.passthrough, DESCENDANTS)
  }
}

function omit(record: Record<string, JSONValue>, key: string): Record<string, JSONValue> {
  const next: Record<string, JSONValue> = {}
  for (const [name, value] of Object.entries(record)) {
    if (name !== key) next[name] = value
  }
  return next
}

function placement(document: DocumentStore, node: GraphNode): number {
  const ids =
    node.parentId === null ? document.rootIds : (document.getNode(node.parentId)?.childIds ?? [])
  const index = ids.indexOf(node.id)
  return index === -1 ? ids.length : index
}

import * as v from 'valibot'

import type { DocumentStore } from '@open-pencil/engine'
import type { GraphNode, JSONValue } from '@open-pencil/session'
import { jsonValueSchema, nodeDraftSchema } from '@open-pencil/session/schema'

import type { StructuralKind } from './names'
import { accepted, failed, INVALID_INPUT, OUTSIDE_SELECTION, type ToolOutcome } from './outcome'
import { idInScope, parentInScope, type AutomationScope } from './scope'

const fieldRecordSchema = v.record(v.string(), jsonValueSchema)

const updateInputSchema = v.object({
  id: v.string(),
  fields: fieldRecordSchema
})

const batchUpdateInputSchema = v.object({
  operations: v.array(updateInputSchema)
})

const createInputSchema = v.object({
  parentId: v.nullable(v.string()),
  index: v.number(),
  node: nodeDraftSchema
})

const deleteIdsSchema = v.object({
  ids: v.array(v.string())
})

const deleteIdSchema = v.object({
  id: v.string()
})

const deleteInputSchema = v.union([deleteIdsSchema, deleteIdSchema])

const queryInputSchema = v.object({
  id: v.optional(v.string()),
  parentId: v.optional(v.nullable(v.string()))
})

type DeleteInput = v.InferOutput<typeof deleteInputSchema>

export function runStructural(
  store: DocumentStore,
  scope: AutomationScope,
  kind: StructuralKind,
  name: string,
  input: unknown
): ToolOutcome {
  if (kind === 'create') return runCreate(store, scope, input)
  if (kind === 'update') return runUpdate(store, scope, name, input)
  if (kind === 'delete') return runDelete(store, scope, input)
  return runQuery(store, scope, input)
}

export function readNode(store: DocumentStore, scope: AutomationScope, id: string): ToolOutcome {
  if (!idInScope(store, scope, id)) return failed(OUTSIDE_SELECTION)
  return accepted(store.getNode(id) ?? null)
}

export function writeField(
  store: DocumentStore,
  scope: AutomationScope,
  id: string,
  field: string,
  value: JSONValue
): ToolOutcome {
  return writeFields(store, scope, id, { [field]: value })
}

function writeFields(
  store: DocumentStore,
  scope: AutomationScope,
  id: string,
  fields: Record<string, JSONValue>
): ToolOutcome {
  if (!idInScope(store, scope, id)) return failed(OUTSIDE_SELECTION)
  const applied = store.apply({ type: 'edit', id, fields })
  if (!applied.ack.accepted) return failed(applied.ack.reason ?? 'rejected')
  return accepted(store.getNode(id) ?? null)
}

function runCreate(store: DocumentStore, scope: AutomationScope, input: unknown): ToolOutcome {
  const parsed = v.safeParse(createInputSchema, input)
  if (!parsed.success) return failed(INVALID_INPUT)
  const { parentId, index, node } = parsed.output
  if (!parentInScope(store, scope, parentId)) return failed(OUTSIDE_SELECTION)
  const before = siblingIds(store, parentId)
  const applied = store.apply({ type: 'create', parentId, index, node })
  if (!applied.ack.accepted) return failed(applied.ack.reason ?? 'rejected')
  return accepted(createdNode(store, parentId, before, node.id))
}

function runUpdate(
  store: DocumentStore,
  scope: AutomationScope,
  name: string,
  input: unknown
): ToolOutcome {
  if (name === 'batch_update') return runBatch(store, scope, input)
  return runEdit(store, scope, input)
}

function runEdit(store: DocumentStore, scope: AutomationScope, input: unknown): ToolOutcome {
  const parsed = v.safeParse(updateInputSchema, input)
  if (!parsed.success) return failed(INVALID_INPUT)
  return writeFields(store, scope, parsed.output.id, parsed.output.fields)
}

function runBatch(store: DocumentStore, scope: AutomationScope, input: unknown): ToolOutcome {
  const parsed = v.safeParse(batchUpdateInputSchema, input)
  if (!parsed.success) return failed(INVALID_INPUT)
  for (const operation of parsed.output.operations) {
    if (!idInScope(store, scope, operation.id)) return failed(OUTSIDE_SELECTION)
  }
  let last: GraphNode | null = null
  for (const operation of parsed.output.operations) {
    const written = writeFields(store, scope, operation.id, operation.fields)
    if (!written.ok) return written
    last = written.node ?? null
  }
  return accepted(last)
}

function runDelete(store: DocumentStore, scope: AutomationScope, input: unknown): ToolOutcome {
  const parsed = v.safeParse(deleteInputSchema, input)
  if (!parsed.success) return failed(INVALID_INPUT)
  const ids = idsOf(parsed.output)
  for (const id of ids) {
    if (!idInScope(store, scope, id)) return failed(OUTSIDE_SELECTION)
  }
  const applied = store.apply({ type: 'delete', ids })
  if (!applied.ack.accepted) return failed(applied.ack.reason ?? 'rejected')
  return { ok: true }
}

function runQuery(store: DocumentStore, scope: AutomationScope, input: unknown): ToolOutcome {
  const parsed = v.safeParse(queryInputSchema, input)
  if (!parsed.success) return failed(INVALID_INPUT)
  if (parsed.output.id !== undefined) return readNode(store, scope, parsed.output.id)
  return readChildren(store, scope, parsed.output.parentId ?? null)
}

function readChildren(
  store: DocumentStore,
  scope: AutomationScope,
  parentId: string | null
): ToolOutcome {
  if (scope === 'selection' && parentId === null) {
    return { ok: true, nodes: nodesById(store, [...store.selection]) }
  }
  if (parentId !== null && !idInScope(store, scope, parentId)) return failed(OUTSIDE_SELECTION)
  if (parentId !== null && !store.nodes.has(parentId)) return failed('missing-node')
  const ids = parentId === null ? store.rootIds : childIds(store, parentId)
  const nodes = nodesById(store, ids).filter((node) => idInScope(store, scope, node.id))
  return { ok: true, nodes }
}

function idsOf(input: DeleteInput): string[] {
  if ('ids' in input) return input.ids
  return [input.id]
}

function siblingIds(store: DocumentStore, parentId: string | null): string[] {
  if (parentId === null) return [...store.rootIds]
  return [...childIds(store, parentId)]
}

function childIds(store: DocumentStore, parentId: string): readonly string[] {
  return store.nodes.get(parentId)?.childIds ?? []
}

function createdNode(
  store: DocumentStore,
  parentId: string | null,
  before: readonly string[],
  id: string | undefined
): GraphNode | null {
  if (id !== undefined && id.length > 0) return store.getNode(id) ?? null
  const known = new Set(before)
  const added = siblingIds(store, parentId).find((candidate) => !known.has(candidate))
  if (added === undefined) return null
  return store.getNode(added) ?? null
}

function nodesById(store: DocumentStore, ids: readonly string[]): GraphNode[] {
  const nodes: GraphNode[] = []
  for (const id of ids) {
    const node = store.getNode(id)
    if (node) nodes.push(node)
  }
  return nodes
}

import type { DocumentStore } from '@open-pencil/engine'

export const AUTOMATION_SCOPES = ['document', 'selection'] as const

export type AutomationScope = (typeof AUTOMATION_SCOPES)[number]

/**
 * Selection scope reaches a selected layer and its descendants. A write to any
 * other id is rejected before the document changes.
 */
export function idInScope(store: DocumentStore, scope: AutomationScope, id: string): boolean {
  if (scope !== 'selection') return true
  return withinSelection(store, id)
}

/** A root create is outside the selection. A create under a reached parent is not. */
export function parentInScope(
  store: DocumentStore,
  scope: AutomationScope,
  parentId: string | null
): boolean {
  if (scope !== 'selection') return true
  if (parentId === null) return false
  return withinSelection(store, parentId)
}

function withinSelection(store: DocumentStore, id: string): boolean {
  const seen = new Set<string>()
  let current: string | null = id
  while (current !== null) {
    if (store.selection.has(current)) return true
    if (seen.has(current)) return false
    seen.add(current)
    const node = store.nodes.get(current)
    if (!node) return false
    current = node.parentId
  }
  return false
}

import type { GraphNode } from '@open-pencil/session'

export const NOT_IN_THIS_MILESTONE = 'not-in-this-milestone'
export const OUTSIDE_SELECTION = 'outside-selection'
export const UNSUPPORTED_SCRIPT = 'unsupported-script'
export const INVALID_INPUT = 'invalid-input'

export interface ToolOutcome {
  readonly ok: boolean
  readonly reason?: string
  readonly node?: GraphNode | null
  readonly nodes?: readonly GraphNode[]
}

export function failed(reason: string): ToolOutcome {
  return { ok: false, reason }
}

export function accepted(node: GraphNode | null): ToolOutcome {
  if (node === null) return { ok: true, node: null, nodes: [] }
  return { ok: true, node, nodes: [node] }
}

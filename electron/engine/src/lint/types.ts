import type { Command, GraphNode, JSONValue } from '@open-pencil/session'

/** The parity set from `packages/core/src/lint/rules`. */
export const RULE_IDS = [
  'no-hardcoded-colors',
  'no-default-names',
  'prefer-auto-layout',
  'consistent-spacing',
  'consistent-radius',
  'color-contrast',
  'touch-target-size',
  'text-style-required',
  'min-text-size',
  'no-hidden-layers',
  'no-deeply-nested',
  'no-empty-frames',
  'pixel-perfect',
  'no-groups',
  'effect-style-required',
  'no-mixed-styles',
  'no-detached-instances'
] as const

export type RuleId = (typeof RULE_IDS)[number]

export type Category =
  | 'layout'
  | 'accessibility'
  | 'naming'
  | 'structure'
  | 'components'
  | 'design-tokens'
  | 'typography'

export type Severity = 'error' | 'warning' | 'info'

/**
 * Recommended severities. Color contrast is the only error, so a lint gate can
 * fail the process on it and on nothing else.
 */
export const RULE_SEVERITY = {
  'no-hardcoded-colors': 'info',
  'no-default-names': 'info',
  'prefer-auto-layout': 'info',
  'consistent-spacing': 'info',
  'consistent-radius': 'info',
  'color-contrast': 'error',
  'touch-target-size': 'warning',
  'text-style-required': 'info',
  'min-text-size': 'warning',
  'no-hidden-layers': 'info',
  'no-deeply-nested': 'info',
  'no-empty-frames': 'info',
  'pixel-perfect': 'info',
  'no-groups': 'info',
  'effect-style-required': 'info',
  'no-mixed-styles': 'info',
  'no-detached-instances': 'info'
} as const satisfies Record<RuleId, Severity>

export const RULE_CATEGORY = {
  'no-hardcoded-colors': 'design-tokens',
  'no-default-names': 'naming',
  'prefer-auto-layout': 'layout',
  'consistent-spacing': 'layout',
  'consistent-radius': 'layout',
  'color-contrast': 'accessibility',
  'touch-target-size': 'accessibility',
  'text-style-required': 'typography',
  'min-text-size': 'accessibility',
  'no-hidden-layers': 'structure',
  'no-deeply-nested': 'structure',
  'no-empty-frames': 'structure',
  'pixel-perfect': 'layout',
  'no-groups': 'structure',
  'effect-style-required': 'design-tokens',
  'no-mixed-styles': 'typography',
  'no-detached-instances': 'components'
} as const satisfies Record<RuleId, Category>

/** `no-detached-instances` stays off until a config turns it on, matching recommended. */
export const RULE_ENABLED = {
  'no-hardcoded-colors': true,
  'no-default-names': true,
  'prefer-auto-layout': true,
  'consistent-spacing': true,
  'consistent-radius': true,
  'color-contrast': true,
  'touch-target-size': true,
  'text-style-required': true,
  'min-text-size': true,
  'no-hidden-layers': true,
  'no-deeply-nested': true,
  'no-empty-frames': true,
  'pixel-perfect': true,
  'no-groups': true,
  'effect-style-required': true,
  'no-mixed-styles': true,
  'no-detached-instances': false
} as const satisfies Record<RuleId, boolean>

/** WCAG AA touch target. The rule's AAA size is available as `minSize: 44`. */
export const DEFAULT_TOUCH_MIN = 24
export const DEFAULT_TEXT_MIN = 12
export const DEFAULT_DEPTH = 6
export const DEFAULT_SPACING_BASE = 4
export const DEFAULT_MIN_CHILDREN = 2

export interface RuleOptions {
  readonly minSize?: number
  readonly maxDepth?: number
  readonly base?: number
  readonly minChildren?: number
}

export type RuleSetting = 'off' | 'on' | { readonly options?: RuleOptions }

export interface LintConfig {
  readonly rules?: Partial<Record<RuleId, RuleSetting>>
}

export type VariableKind = 'color' | 'number' | 'string' | 'boolean'

export interface LintVariables {
  readonly counts: Readonly<Record<VariableKind, number>>
  readonly colorsByHex: ReadonlyMap<string, { readonly name: string }>
  resolve(name: string): JSONValue | undefined
}

/** Bags copied off a checkpoint. Dismissals use `${nodeId}:${ruleId}`. */
export interface LintSource {
  readonly variables?: Readonly<Record<string, JSONValue>>
  readonly lintDismissals?: Readonly<Record<string, JSONValue>>
  readonly config?: LintConfig
}

export interface LintContext {
  readonly nodes: ReadonlyMap<string, GraphNode>
  readonly roots: readonly string[]
  readonly variables: LintVariables
  readonly dismissals: Readonly<Record<string, JSONValue>>
  readonly config: LintConfig
}

export interface LintIssue {
  readonly message: string
  readonly suggest?: string
  readonly data?: Readonly<Record<string, string | number>>
  readonly command?: Command
}

export interface LintFinding {
  readonly ruleId: RuleId
  readonly severity: Severity
  readonly category: Category
  readonly message: string
  readonly nodeId: string
  readonly nodeName: string
  readonly nodePath: readonly string[]
  readonly suggest?: string
  readonly data?: Readonly<Record<string, string | number>>
  readonly command?: Command
}

/** A graph edit. `recheckIds` reads the graph after the edit has been applied. */
export type NodeChange =
  | { readonly kind: 'edit'; readonly id: string; readonly fields: readonly string[] }
  | { readonly kind: 'move'; readonly id: string; readonly fromParentId?: string | null }
  | { readonly kind: 'structure'; readonly id: string | null }

/** Open, variable edits, and lint config edits walk the whole document. */
export const DOCUMENT_PASS_KINDS = ['open', 'variables', 'config'] as const

export type DocumentPassKind = (typeof DOCUMENT_PASS_KINDS)[number]

export type LintCheck = (
  node: GraphNode,
  context: LintContext,
  report: (issue: LintIssue) => void
) => void

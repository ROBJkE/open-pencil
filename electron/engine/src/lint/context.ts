import type { GraphNode } from '@open-pencil/session'

import { indexGraph } from './walk'
import { RULE_ENABLED, type LintContext, type LintSource, type RuleId, type RuleOptions } from './types'
import { describeVariables } from './variables'

export function lintContext(nodes: readonly GraphNode[], source: LintSource = {}): LintContext {
  const indexed = indexGraph(nodes)
  return {
    nodes: indexed.nodes,
    roots: indexed.roots,
    variables: describeVariables(source.variables),
    dismissals: source.lintDismissals ?? {},
    config: source.config ?? {}
  }
}

export function ruleEnabled(context: LintContext, id: RuleId): boolean {
  const setting = context.config.rules?.[id]
  if (setting === 'off') return false
  if (setting === 'on') return true
  if (typeof setting === 'object') return true
  return RULE_ENABLED[id]
}

export function ruleOptions(context: LintContext, id: RuleId): RuleOptions {
  const setting = context.config.rules?.[id]
  if (typeof setting === 'object') return setting.options ?? {}
  return {}
}

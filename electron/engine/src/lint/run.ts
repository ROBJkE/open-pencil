import type { GraphNode } from '@open-pencil/session'

import { ruleEnabled } from './context'
import { CHECKS } from './rules'
import {
  RULE_CATEGORY,
  RULE_IDS,
  RULE_SEVERITY,
  type LintContext,
  type LintFinding,
  type LintIssue,
  type RuleId
} from './types'
import { insideInstance, layerName, nodePath } from './walk'

export function lintNode(node: GraphNode, context: LintContext): readonly LintFinding[] {
  if (insideInstance(node, context.nodes)) return []
  const findings: LintFinding[] = []
  for (const id of RULE_IDS) {
    if (!ruleEnabled(context, id)) continue
    CHECKS[id](node, context, (issue) => {
      if (isDismissed(context, node.id, id)) return
      findings.push(toFinding(id, node, context, issue))
    })
  }
  return findings
}

/** A dismissal is the checkpoint bag entry `${nodeId}:${ruleId}`. */
function isDismissed(context: LintContext, nodeId: string, ruleId: RuleId): boolean {
  const value = context.dismissals[`${nodeId}:${ruleId}`]
  return value === true || (typeof value === 'object' && value !== null)
}

function toFinding(
  id: RuleId,
  node: GraphNode,
  context: LintContext,
  issue: LintIssue
): LintFinding {
  return {
    ruleId: id,
    severity: RULE_SEVERITY[id],
    category: RULE_CATEGORY[id],
    message: issue.message,
    nodeId: node.id,
    nodeName: layerName(node),
    nodePath: nodePath(node, context.nodes),
    suggest: issue.suggest,
    data: issue.data,
    command: issue.command
  }
}

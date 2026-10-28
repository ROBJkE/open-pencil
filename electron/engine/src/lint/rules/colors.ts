import type { GraphNode } from '@open-pencil/session'

import { colorToHex } from '../color'
import { bindCommand } from '../command'
import { paintsOf, type LintPaint } from '../read'
import type { LintCheck, LintContext, LintIssue } from '../types'

const COLOR_TYPES = new Set([
  'rectangle',
  'ellipse',
  'frame',
  'text',
  'path',
  'line',
  'polygon',
  'star',
  'ref',
  'icon_font'
])

export const checkColors: LintCheck = (node, context, report) => {
  if (!COLOR_TYPES.has(node.type) || context.variables.colorsByHex.size === 0) return
  reportPaint(node, 'fill', context, report)
  reportPaint(node, 'stroke', context, report)
}

function reportPaint(
  node: GraphNode,
  field: 'fill' | 'stroke',
  context: LintContext,
  report: (issue: LintIssue) => void
): void {
  const paints = paintsOf(node, field, context.variables)
  for (const [index, paint] of paints.entries()) {
    const match = matchingVariable(paint, context)
    if (!match) continue
    const label = field === 'fill' ? 'fill' : 'stroke'
    report({
      message: `Hardcoded ${label} color ${match.color} matches variable "${match.name}"`,
      suggest: `Bind ${label} to "${match.name}"`,
      data: { paint: label, index, color: match.color, variableName: match.name },
      ...(paints.length === 1 ? { command: bindCommand(node.id, field, match.name) } : {})
    })
  }
}

function matchingVariable(
  paint: LintPaint,
  context: LintContext
): { readonly color: string; readonly name: string } | undefined {
  if (paint.kind !== 'solid' || !paint.visible || paint.bound) return undefined
  const color = colorToHex(paint.color)
  const variable = context.variables.colorsByHex.get(color)
  if (!variable) return undefined
  return { color, name: variable.name }
}

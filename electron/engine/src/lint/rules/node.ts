import type { Edges } from '#engine/layout/fields'
import { layoutMode } from '#engine/layout/fields'

import type { GraphNode, JSONValue } from '@open-pencil/session'

import { deleteCommand, editCommand } from '../command'
import { ruleOptions } from '../context'
import {
  cornerRadii,
  effectsOf,
  fieldBound,
  fontSizeOf,
  gapValue,
  layerNumber,
  layerVisible,
  paddingValue,
  styleRunCount,
  textContent
} from '../read'
import type { LintCheck, LintIssue } from '../types'
import {
  DEFAULT_SPACING_BASE,
  DEFAULT_TEXT_MIN,
  DEFAULT_DEPTH
} from '../types'
import { inComponentTree, layerName } from '../walk'
import {
  isDefaultName,
  isMultipleOf,
  nearestValue,
  PILL_RADIUS,
  RADIUS_SCALE,
  SPACING_SCALE
} from './scale'

const SMALL_TYPES = new Set(['rectangle', 'ellipse', 'line'])
const RADIUS_TYPES = new Set(['rectangle', 'frame', 'ref'])
const TEXT_TYPES = new Set(['text', 'icon_font'])

type Report = (issue: LintIssue) => void

export const checkDefaultNames: LintCheck = (node, _context, report) => {
  const name = layerName(node)
  if (!isDefaultName(name)) return
  const width = layerNumber(node, 'width', 0)
  const height = layerNumber(node, 'height', 0)
  if (SMALL_TYPES.has(node.type) && width < 24 && height < 24) return
  report({
    message: `Default layer name "${name}" is not descriptive`,
    suggest: 'Rename to describe the layer purpose',
    data: { name }
  })
}

export const checkRadius: LintCheck = (node, _context, report) => {
  if (!RADIUS_TYPES.has(node.type)) return
  const radii = cornerRadii(node)
  if (!radii) return
  const seen = new Set<number>()
  for (const radius of radii) {
    if (seen.has(radius)) continue
    seen.add(radius)
    reportRadius(node, radius, report)
  }
}

export const checkSpacing: LintCheck = (node, context, report) => {
  if (node.type !== 'frame' || layoutMode(node) === 'none') return
  const base = ruleOptions(context, 'consistent-spacing').base ?? DEFAULT_SPACING_BASE
  const gap = gapValue(node)
  if (gap !== undefined && gap > 0 && !onSpacingScale(gap, base)) {
    const suggested = suggestedSpacing(gap, base)
    reportSpacing(node, 'gap', gap, base, suggested === undefined ? undefined : { gap: suggested }, report)
  }
  const padding = paddingValue(node)
  if (!padding) return
  reportPadding(node, padding, base, report)
}

export const checkEffects: LintCheck = (node, _context, report) => {
  const effects = effectsOf(node)
  if (effects.length === 0) return
  const first = effects[0]
  const detail = effects.map((effect) => `${effect.type} ${effect.radius}px`).join(', ')
  report({
    message: `Effect without shared style: ${detail}`,
    suggest: 'Extract reusable shadows and blurs into shared presets or variables',
    data: { effect: first.type, count: effects.length }
  })
}

export const checkMinText: LintCheck = (node, context, report) => {
  if (!TEXT_TYPES.has(node.type)) return
  const minSize = ruleOptions(context, 'min-text-size').minSize ?? DEFAULT_TEXT_MIN
  const fontSize = fontSizeOf(node, context.variables)
  if (fontSize >= minSize) return
  report({
    message: `Text size ${fontSize}px is below minimum ${minSize}px`,
    suggest: `Increase to at least ${minSize}px for readability`,
    data: { fontSize, minSize },
    command: editCommand(node.id, { fontSize: minSize })
  })
}

export const checkHidden: LintCheck = (node, context, report) => {
  if (layerVisible(node)) return
  report({
    message: 'Hidden layer detected',
    suggest: 'Delete if unused or keep only if required for component states',
    ...(inComponentTree(node, context.nodes) ? {} : { command: deleteCommand(node.id) })
  })
}

export const checkGroups: LintCheck = (node, _context, report) => {
  if (node.type !== 'group') return
  report({
    message: 'Group should be converted to Frame',
    suggest: 'Groups cannot use auto layout. Convert to Frame for better control.'
  })
}

export const checkMixed: LintCheck = (node, _context, report) => {
  if (!TEXT_TYPES.has(node.type)) return
  const runs = styleRunCount(node)
  if (textContent(node).length <= 1 || runs === 0) return
  report({
    message: 'Text layer has mixed font styles',
    suggest: 'Split into separate text layers or unify the text style',
    data: { styleRuns: runs }
  })
}

export const checkDepth: LintCheck = (node, context, report) => {
  const maxDepth = ruleOptions(context, 'no-deeply-nested').maxDepth ?? DEFAULT_DEPTH
  let depth = 0
  let parentId = node.parentId
  const seen = new Set<string>([node.id])
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId)
    depth += 1
    parentId = context.nodes.get(parentId)?.parentId ?? null
  }
  if (depth !== maxDepth + 1) return
  report({
    message: `Layer nested ${depth} levels deep (max ${maxDepth})`,
    suggest: 'Flatten structure or extract a component',
    data: { depth, maxDepth }
  })
}

export const checkTextStyle: LintCheck = (node, context, report) => {
  if (!TEXT_TYPES.has(node.type) || textContent(node).length <= 2) return
  if (fieldBound(node.fields.fontSize) || fieldBound(node.fields.fontFamily)) return
  const { number, string } = context.variables.counts
  if (number === 0 && string === 0) return
  report({
    message: 'Text layer without typography variable bindings',
    suggest: 'Bind font size or font family to a shared text token when possible'
  })
}

function reportRadius(node: GraphNode, radius: number, report: Report): void {
  if (radius <= 0 || radius === PILL_RADIUS || RADIUS_SCALE.includes(radius)) return
  const pill = radius >= Math.min(layerNumber(node, 'width', 0), layerNumber(node, 'height', 0)) / 2
  const suggested = pill ? PILL_RADIUS : nearestValue(radius, RADIUS_SCALE.slice(1))
  report({
    message: `Corner radius ${radius}px is not in scale`,
    suggest: 'Use a radius token or a scale value',
    data: { radius },
    ...(suggested === undefined
      ? {}
      : { command: editCommand(node.id, { cornerRadius: suggested }) })
  })
}

function onSpacingScale(value: number, base: number): boolean {
  return SPACING_SCALE.includes(value) || isMultipleOf(value, base)
}

function suggestedSpacing(value: number, base: number): number | undefined {
  const step = base > 0 ? base : 1
  const multiples = [Math.floor(value / step) * step, Math.ceil(value / step) * step]
  const candidates = [...SPACING_SCALE, ...multiples].filter((candidate) => candidate > 0)
  return nearestValue(value, candidates)
}

function reportSpacing(
  node: GraphNode,
  property: string,
  value: number,
  base: number,
  fields: Record<string, JSONValue> | undefined,
  report: Report
): void {
  report({
    message: `${property} ${value}px is not in spacing scale`,
    suggest: `Use a spacing token or a multiple of ${base}px`,
    data: { property, value, base },
    ...(fields ? { command: editCommand(node.id, fields) } : {})
  })
}

function reportPadding(node: GraphNode, padding: Edges, base: number, report: Report): void {
  const sides = [
    ['paddingTop', padding.top],
    ['paddingRight', padding.right],
    ['paddingBottom', padding.bottom],
    ['paddingLeft', padding.left]
  ] as const
  for (const [property, value] of sides) {
    if (value <= 0 || onSpacingScale(value, base)) continue
    const suggested = suggestedSpacing(value, base)
    if (suggested === undefined) continue
    const next = { ...padding, [sideOf(property)]: suggested }
    reportSpacing(node, property, value, base, { padding: paddingFields(next) }, report)
  }
}

function sideOf(property: string): keyof Edges {
  if (property === 'paddingRight') return 'right'
  if (property === 'paddingBottom') return 'bottom'
  if (property === 'paddingLeft') return 'left'
  return 'top'
}

function paddingFields(edges: Edges): JSONValue {
  if (edges.top === edges.right && edges.top === edges.bottom && edges.top === edges.left) {
    return edges.top
  }
  return [edges.top, edges.right, edges.bottom, edges.left]
}

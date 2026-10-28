import type { Edges } from '#engine/layout/fields'
import { gapOf, isVisible, paddingOf } from '#engine/layout/fields'

import type { GraphNode, JSONValue } from '@open-pencil/session'

import { opaque, parseHexColor, type RGB } from './color'
import { finite, isRef, jsonList, jsonRecord } from './json'
import type { LintVariables } from './types'
import { resolveValue } from './variables'

export interface SolidPaint {
  readonly kind: 'solid'
  readonly visible: boolean
  readonly opacity: number
  readonly color: RGB
  readonly bound: boolean
}

export interface ComplexPaint {
  readonly kind: 'complex'
  readonly visible: boolean
  readonly opacity: number
}

export type LintPaint = SolidPaint | ComplexPaint

export interface TextStyle {
  readonly fontSize: number
  readonly fontWeight: number
}

export interface LintEffect {
  readonly type: string
  readonly radius: number
}

const FONT_WEIGHTS: Readonly<Record<string, number>> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900
}

export function layerVisible(node: GraphNode): boolean {
  return isVisible(node)
}

export function layerNumber(node: GraphNode, key: string, fallback: number): number {
  return finite(node.fields[key]) ?? fallback
}

export function textContent(node: GraphNode): string {
  if (node.type === 'icon_font') {
    const icon = node.fields.iconFontName
    return typeof icon === 'string' ? icon : ''
  }
  const content = node.fields.content
  return typeof content === 'string' ? content : ''
}

export function fontSizeOf(node: GraphNode, variables: LintVariables): number {
  return finite(resolveValue(node.fields.fontSize, variables)) ?? 14
}

export function fontWeightOf(node: GraphNode, variables: LintVariables): number {
  return weightNumber(resolveValue(weightSource(node), variables), 400)
}

export function textStyles(node: GraphNode, variables: LintVariables): TextStyle[] {
  const base = {
    fontSize: fontSizeOf(node, variables),
    fontWeight: fontWeightOf(node, variables)
  }
  const runs = styleRuns(node, variables, base)
  if (runs.length === 0) return [base]
  const covered = runs.reduce((total, run) => total + run.length, 0)
  const styles = runs.map((run) => run.style)
  return covered < textContent(node).length ? [base, ...styles] : styles
}

export function styleRunCount(node: GraphNode): number {
  const raw = runSource(node)
  const list = jsonList(raw)
  return list ? list.length : 0
}

export function fieldBound(value: JSONValue | undefined): boolean {
  return typeof value === 'string' && isRef(value)
}

export function paintsOf(
  node: GraphNode,
  field: 'fill' | 'stroke',
  variables: LintVariables
): readonly LintPaint[] {
  const source = field === 'fill' ? node.fields.fill : strokeSource(node)
  const list = jsonList(source) ?? (source === undefined ? [] : [source])
  const paints: LintPaint[] = []
  for (const item of list) {
    const paint = paintFrom(item, variables)
    if (paint) paints.push(paint)
  }
  return paints
}

export function effectsOf(node: GraphNode): readonly LintEffect[] {
  const items = effectItems(node)
  const effects: LintEffect[] = []
  for (const item of items) {
    const body = jsonRecord(item)
    if (!body || body.enabled === false || body.enabled === 'false') continue
    const type = typeof body.type === 'string' ? body.type : 'effect'
    effects.push({ type, radius: finite(body.blur) ?? finite(body.radius) ?? 0 })
  }
  return effects
}

export function gapValue(node: GraphNode): number | undefined {
  if (fieldBound(node.fields.gap)) return undefined
  return gapOf(node)
}

export function paddingValue(node: GraphNode): Edges | undefined {
  if (!Object.hasOwn(node.fields, 'padding') || fieldBound(node.fields.padding)) return undefined
  return paddingOf(node.fields.padding)
}

/** One number, or each corner when they differ. Undefined when a corner is a variable. */
export function cornerRadii(node: GraphNode): readonly number[] | undefined {
  const raw = node.fields.cornerRadius
  if (!Object.hasOwn(node.fields, 'cornerRadius') || raw === null) return undefined
  if (typeof raw === 'string') {
    if (isRef(raw)) return undefined
    const value = finite(raw)
    return value === undefined ? undefined : [value]
  }
  if (typeof raw === 'number') return Number.isFinite(raw) ? [raw] : undefined
  const list = jsonList(raw)
  if (!list) return undefined
  const numbers: number[] = []
  for (const item of list) {
    if (typeof item === 'string' && isRef(item)) return undefined
    const value = finite(item)
    if (value === undefined) return undefined
    numbers.push(value)
  }
  return numbers
}

function weightNumber(value: JSONValue | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return fallback
  const numeric = finite(value)
  if (numeric !== undefined && numeric > 0) return numeric
  return FONT_WEIGHTS[value.toLowerCase()] ?? fallback
}

function effectItems(node: GraphNode): readonly JSONValue[] {
  const list = jsonList(node.fields.effect)
  if (list && list.length > 0) return list
  const single = jsonRecord(node.fields.effect)
  if (single) return [single]
  return []
}

function weightSource(node: GraphNode): JSONValue | undefined {
  if (Object.hasOwn(node.fields, 'fontWeight')) return node.fields.fontWeight
  if (node.type === 'icon_font' && Object.hasOwn(node.fields, 'weight')) return node.fields.weight
  return undefined
}

function runSource(node: GraphNode): JSONValue | undefined {
  if (Object.hasOwn(node.fields, 'styleRuns')) return node.fields.styleRuns
  if (Object.hasOwn(node.passthrough, 'styleRuns')) return node.passthrough.styleRuns
  return undefined
}

interface StyleRun {
  readonly length: number
  readonly style: TextStyle
}

function styleRuns(node: GraphNode, variables: LintVariables, base: TextStyle): StyleRun[] {
  const list = jsonList(runSource(node))
  if (!list) return []
  const runs: StyleRun[] = []
  for (const item of list) {
    const body = jsonRecord(item)
    if (!body) continue
    const style = jsonRecord(body.style)
    runs.push({
      length: finite(body.length) ?? 0,
      style: {
        fontSize: finite(resolveValue(style?.fontSize, variables)) ?? base.fontSize,
        fontWeight: weightNumber(resolveValue(style?.fontWeight, variables), base.fontWeight)
      }
    })
  }
  return runs
}

function strokeSource(node: GraphNode): JSONValue | undefined {
  const body = jsonRecord(node.fields.stroke)
  if (body && Object.hasOwn(body, 'thickness')) return body.fill
  return node.fields.stroke
}

function paintFrom(value: JSONValue, variables: LintVariables): LintPaint | undefined {
  if (typeof value === 'string') return solidFrom(value, true, undefined, variables)
  const body = jsonRecord(value)
  if (!body) return undefined
  const visible = body.enabled !== false && body.enabled !== 'false'
  if (typeof body.type === 'string' && body.type !== 'color') {
    return { kind: 'complex', visible, opacity: finite(body.opacity) ?? 1 }
  }
  if (typeof body.color !== 'string') return undefined
  return solidFrom(body.color, visible, finite(body.opacity), variables)
}

function solidFrom(
  raw: string,
  visible: boolean,
  opacity: number | undefined,
  variables: LintVariables
): LintPaint {
  const bound = isRef(raw)
  const text = bound ? resolvedColor(raw, variables) : raw
  const parsed = text === undefined ? undefined : parseHexColor(text)
  if (!parsed) return { kind: 'complex', visible, opacity: opacity ?? 1 }
  return {
    kind: 'solid',
    visible,
    opacity: parsed.a * (opacity ?? 1),
    color: opaque(parsed),
    bound
  }
}

function resolvedColor(raw: string, variables: LintVariables): string | undefined {
  const resolved = variables.resolve(raw.slice(1))
  return typeof resolved === 'string' ? resolved : undefined
}

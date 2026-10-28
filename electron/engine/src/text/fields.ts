import type { GraphNode, JSONValue } from '@open-pencil/session'

/** `.pen` text with no family uses Inter. */
const DEFAULT_FONT_FAMILY = 'Inter'

/** `.pen` text with no size uses 14. */
const DEFAULT_FONT_SIZE = 14

const DEFAULT_FONT_WEIGHT = 400

/** A line that does not wrap lays out inside this width. */
const UNBOUNDED_TEXT_WIDTH = 1_000_000

export type TextGrowth = 'auto' | 'fixed-width' | 'fixed-width-height'

export function textContent(node: GraphNode): string {
  const value = node.fields.content
  return typeof value === 'string' ? value : ''
}

export function textFamily(node: GraphNode): string {
  const value = node.fields.fontFamily
  if (typeof value !== 'string') return DEFAULT_FONT_FAMILY
  const family = value.trim()
  return family.length > 0 ? family : DEFAULT_FONT_FAMILY
}

export function textFontSize(node: GraphNode): number {
  const size = finiteNumber(node.fields.fontSize)
  if (size === undefined || size < 0) return DEFAULT_FONT_SIZE
  return size
}

/** The node's weight when it has one, otherwise the face weight, otherwise 400. */
export function textWeight(node: GraphNode, faceWeight?: number): number {
  const weight = finiteNumber(node.fields.fontWeight)
  if (weight !== undefined && weight > 0) return weight
  if (faceWeight !== undefined && Number.isFinite(faceWeight) && faceWeight > 0) return faceWeight
  return DEFAULT_FONT_WEIGHT
}

export function textItalic(node: GraphNode, style: string): boolean {
  const named = typeof node.fields.fontStyle === 'string' ? node.fields.fontStyle : style
  return named.toLowerCase().includes('italic')
}

export function textLetterSpacing(node: GraphNode): number | undefined {
  return finiteNumber(node.fields.letterSpacing)
}

/** `.pen` line height is a multiple of the font size. */
export function textLineHeight(node: GraphNode): number | undefined {
  const multiplier = finiteNumber(node.fields.lineHeight)
  if (multiplier === undefined || multiplier <= 0) return undefined
  return multiplier
}

export function textGrowth(node: GraphNode): TextGrowth {
  const value = node.fields.textGrowth
  if (value === 'fixed-width' || value === 'fixed-width-height') return value
  return 'auto'
}

/** Auto text stays on one line. Fixed growth wraps at the node's width. */
export function textLayoutWidth(node: GraphNode): number {
  if (textGrowth(node) === 'auto') return UNBOUNDED_TEXT_WIDTH
  const width = finiteNumber(node.fields.width)
  if (width === undefined || width <= 0) return UNBOUNDED_TEXT_WIDTH
  return width
}

function finiteNumber(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

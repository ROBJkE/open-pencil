import type { GraphNode } from '@open-pencil/session'

import { colorToHex, compositeOver, contrastRatio, type RGB } from '../color'
import { boxCorners, clipPolygon, degreesToRadians, polygonArea, rotatePoint, type Point } from '../geometry'
import { layerNumber, layerVisible, paintsOf, textStyles, type LintPaint, type SolidPaint } from '../read'
import type { LintCheck, LintContext } from '../types'
import { resolveValue } from '../variables'
import { finite } from '../json'
import { ancestorsOf, siblingsBelow } from '../walk'

const MIN_CONTRAST = 4.5
const MIN_LARGE_CONTRAST = 3
const LARGE_TEXT = 24
const LARGE_BOLD_TEXT = 18.66
const BOLD = 700
const BOX_TYPES = new Set(['frame', 'rectangle', 'ref'])
const TEXT_TYPES = new Set(['text', 'icon_font'])

interface Coat {
  color: RGB
  alpha: number
}

const BLACK: RGB = { r: 0, g: 0, b: 0 }

type CoatResult = RGB | null | undefined

export const checkContrast: LintCheck = (node, context, report) => {
  if (!TEXT_TYPES.has(node.type)) return
  const paints = paintsOf(node, 'fill', context.variables)
  const visible = paints.slice(Math.max(lastOpaque(paints), 0))
  if (showsComplex(visible)) return
  const solids = visible.filter(isSolid)
  if (!solids.some((paint) => paint.opacity > 0)) return
  const background = backdrop(node, context)
  if (!background) return
  const foreground = solids.reduce(
    (color, paint) => compositeOver(paint.color, color, paint.opacity),
    background
  )
  const ratio = contrastRatio(foreground, background)
  const minRatio = requiredContrast(node, context)
  if (ratio >= minRatio) return
  report({
    message: `Contrast ratio ${ratio.toFixed(2)}:1 is below WCAG AA`,
    suggest: 'Increase contrast between text and background',
    data: {
      ratio: Math.floor(ratio * 100) / 100,
      minRatio,
      foreground: colorToHex(foreground),
      background: colorToHex(background)
    }
  })
}

function lastOpaque(paints: readonly LintPaint[]): number {
  for (let index = paints.length - 1; index >= 0; index -= 1) {
    const paint = paints[index]
    if (paint.kind === 'solid' && paint.visible && paint.opacity >= 1) return index
  }
  return -1
}

function showsComplex(paints: readonly LintPaint[]): boolean {
  return paints.some((paint) => paint.kind === 'complex' && paint.visible && paint.opacity > 0)
}

function isSolid(paint: LintPaint): paint is SolidPaint {
  return paint.kind === 'solid' && paint.visible
}

function requiredContrast(node: GraphNode, context: LintContext): number {
  let required = MIN_LARGE_CONTRAST
  for (const style of textStyles(node, context.variables)) {
    const large =
      style.fontSize >= LARGE_TEXT || (style.fontSize >= LARGE_BOLD_TEXT && style.fontWeight >= BOLD)
    required = Math.max(required, large ? MIN_LARGE_CONTRAST : MIN_CONTRAST)
  }
  return required
}

function backdrop(node: GraphNode, context: LintContext): RGB | undefined {
  const coats: Coat[] = []
  let text = cornersOf(node)
  let branch = node
  for (const parent of ancestorsOf(context.nodes, node)) {
    const behind = siblingsBehind(text, branch, coats, context)
    if (behind === 'stop') return undefined
    if (behind) return behind
    const own = coatUnder(coats, paintsOf(parent, 'fill', context.variables), 1)
    if (own !== undefined) return own ?? undefined
    text = toParentSpace(text, parent)
    branch = parent
  }
  return undefined
}

function siblingsBehind(
  text: Point[],
  branch: GraphNode,
  coats: Coat[],
  context: LintContext
): RGB | 'stop' | undefined {
  for (const layer of siblingsBelow(context, branch)) {
    const result = layerBehind(text, layer, coats, context)
    if (result === 'skip') continue
    if (result === 'blocked' || result === null) return 'stop'
    if (result) return result
  }
  return undefined
}

function layerBehind(
  text: Point[],
  layer: GraphNode,
  coats: Coat[],
  context: LintContext
): CoatResult | 'skip' | 'blocked' {
  if (!layerVisible(layer) || opacityOf(layer, context) <= 0 || TEXT_TYPES.has(layer.type)) {
    return 'skip'
  }
  const paints = paintsOf(layer, 'fill', context.variables)
  const paintsSomething = paints.some((paint) => paint.visible && paint.opacity > 0)
  if (!paintsSomething && layer.childIds.length === 0) return 'skip'
  const covers = coverage(text, layer)
  if (covers === 'none') return 'skip'
  if (covers === 'part' || !BOX_TYPES.has(layer.type) || layer.childIds.length > 0) return 'blocked'
  return coatUnder(coats, paints, opacityOf(layer, context))
}

function coverage(text: readonly Point[], layer: GraphNode): 'none' | 'all' | 'part' {
  const covered = polygonArea(clipPolygon(text, cornersOf(layer)) ?? [])
  if (covered <= 0) return 'none'
  return covered >= polygonArea(text) - 1e-6 ? 'all' : 'part'
}

function cornersOf(node: GraphNode): Point[] {
  return boxCorners(
    layerNumber(node, 'x', 0),
    layerNumber(node, 'y', 0),
    layerNumber(node, 'width', 0),
    layerNumber(node, 'height', 0),
    layerNumber(node, 'rotation', 0)
  )
}

function toParentSpace(points: readonly Point[], container: GraphNode): Point[] {
  const radians = degreesToRadians(layerNumber(container, 'rotation', 0))
  const cx = layerNumber(container, 'width', 0) / 2
  const cy = layerNumber(container, 'height', 0) / 2
  const x = layerNumber(container, 'x', 0)
  const y = layerNumber(container, 'y', 0)
  return points.map((point) => {
    const turned = rotatePoint(point.x, point.y, cx, cy, radians)
    return { x: turned.x + x, y: turned.y + y }
  })
}

function opacityOf(node: GraphNode, context: LintContext): number {
  return finite(resolveValue(node.fields.opacity, context.variables)) ?? 1
}

function flatten(paints: readonly LintPaint[]): Coat | null {
  let coat: Coat = { color: BLACK, alpha: 0 }
  let unresolved = false
  for (const paint of paints) {
    if (!paint.visible || paint.opacity <= 0) continue
    if (paint.kind !== 'solid') {
      unresolved = true
      continue
    }
    if (paint.opacity >= 1) {
      coat = { color: paint.color, alpha: 1 }
      unresolved = false
      continue
    }
    const alpha = paint.opacity + coat.alpha * (1 - paint.opacity)
    coat = { color: compositeOver(paint.color, coat.color, paint.opacity / alpha), alpha }
  }
  return unresolved ? null : coat
}

function coatUnder(coats: Coat[], paints: readonly LintPaint[], opacity: number): CoatResult {
  const coat = flatten(paints)
  if (!coat) return null
  const alpha = coat.alpha * opacity
  if (alpha <= 0) return undefined
  if (alpha < 1) {
    coats.push({ color: coat.color, alpha })
    return undefined
  }
  return coats.reduceRight((background, layer) => compositeOver(layer.color, background, layer.alpha), coat.color)
}

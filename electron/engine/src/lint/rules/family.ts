import type { GraphNode, JSONValue } from '@open-pencil/session'
import { crossAlign, isAbsolute, layoutMode, sizeSpec } from '#engine/layout/fields'

import { editCommand } from '../command'
import { ruleOptions } from '../context'
import { layerNumber, paintsOf } from '../read'
import { DEFAULT_MIN_CHILDREN, DEFAULT_TOUCH_MIN, type LintCheck } from '../types'
import { childrenOf, layerName, parentOf } from '../walk'
import { nameWords } from './scale'

const DETACHED = [
  /^(button|btn)/i,
  /^(input|field|text-?field)/i,
  /^(card|modal|dialog)/i,
  /^(icon|avatar|badge)/i,
  /^(nav|menu|tab)/i,
  /^(header|footer|sidebar)/i,
  /^(list|item|row)/i,
  /^(chip|tag|label)/i,
  /^(tooltip|popover|dropdown)/i
]

const CONTROL_WORDS = new Set([
  'button',
  'btn',
  'link',
  'cta',
  'checkbox',
  'radio',
  'switch',
  'toggle',
  'input',
  'select',
  'dropdown',
  'menu',
  'tab',
  'chip',
  'tag',
  'close',
  'dismiss',
  'action'
])

const TOUCH_TYPES = new Set(['frame', 'rectangle', 'ellipse', 'ref'])
const ARTWORK = new Set(['path', 'boolean', 'star', 'polygon', 'line'])
const ARTWORK_PARENTS = new Set(['group', 'boolean'])

type Axis = 'width' | 'height'
type GeometryKey = 'x' | 'y' | Axis

export const checkEmpty: LintCheck = (node, context, report) => {
  if (node.type !== 'frame' || childrenOf(context.nodes, node).length > 0) return
  const name = layerName(node).toLowerCase()
  const width = layerNumber(node, 'width', 0)
  const height = layerNumber(node, 'height', 0)
  if (name.includes('spacer') || width <= 1 || height <= 1) return
  const filled = paintsOf(node, 'fill', context.variables).some(
    (paint) => paint.kind === 'solid' && paint.visible
  )
  if (filled) return
  report({
    message: 'Empty frame with no fill',
    suggest: 'Delete if unused, or add content/fill'
  })
}

export const checkAutoLayout: LintCheck = (node, context, report) => {
  if (node.type !== 'frame' || layoutMode(node) !== 'none') return
  const minChildren = ruleOptions(context, 'prefer-auto-layout').minChildren ?? DEFAULT_MIN_CHILDREN
  const children = childrenOf(context.nodes, node).length
  if (children < minChildren) return
  report({
    message: `Frame with ${children} children doesn't use auto layout`,
    suggest: 'Add horizontal or vertical auto layout',
    data: { children }
  })
}

export const checkDetached: LintCheck = (node, context, report) => {
  if (node.type !== 'frame' || node.fields.reusable === true) return
  const name = layerName(node)
  if (!DETACHED.some((pattern) => pattern.test(name))) return
  if (childrenOf(context.nodes, node).length === 0 || layoutMode(node) === 'none') return
  report({
    message: `Frame "${name}" looks like a component but isn't an instance`,
    suggest: 'Use a component instance instead of a detached frame'
  })
}

export const checkTouch: LintCheck = (node, context, report) => {
  if (!TOUCH_TYPES.has(node.type)) return
  const name = layerName(node)
  if (!isInteractive(name) || pluralGroup(name, node.childIds.length)) return
  const minSize = ruleOptions(context, 'touch-target-size').minSize ?? DEFAULT_TOUCH_MIN
  const width = layerNumber(node, 'width', 0)
  const height = layerNumber(node, 'height', 0)
  if (width >= minSize && height >= minSize) return
  if (nestedInControl(node, context.nodes)) return
  report({
    message: `Touch target too small: ${width}×${height}px`,
    suggest: `Resize to at least ${minSize}×${minSize}px or add padding`,
    data: { width, height, minSize }
  })
}

export const checkPixel: LintCheck = (node, context, report) => {
  const entries = [
    ['x', layerNumber(node, 'x', 0)],
    ['y', layerNumber(node, 'y', 0)],
    ['width', layerNumber(node, 'width', 0)],
    ['height', layerNumber(node, 'height', 0)]
  ] as const
  const subpixel = entries.filter(([, value]) => Math.abs(value - Math.round(value)) >= 0.01)
  if (subpixel.length === 0) return
  const parent = parentOf(context.nodes, node)
  const owned = ownedGeometry(node, parent)
  const artwork = isArtwork(node, parent)
  const changes: Record<string, JSONValue> = {}
  const data: Record<string, string | number> = {}
  const parts: string[] = []
  for (const [key, value] of subpixel) {
    data[key] = value
    parts.push(`${key}: ${value}`)
    if (!artwork && !owned.has(key)) changes[key] = Math.round(value)
  }
  report({
    message: `Subpixel values: ${parts.join(', ')}`,
    suggest: 'Round to whole pixels for crisp rendering',
    data,
    ...(Object.keys(changes).length > 0 ? { command: editCommand(node.id, changes) } : {})
  })
}

function isArtwork(node: GraphNode, parent: GraphNode | undefined): boolean {
  return ARTWORK.has(node.type) || (parent !== undefined && ARTWORK_PARENTS.has(parent.type))
}

function ownedGeometry(node: GraphNode, parent: GraphNode | undefined): Set<GeometryKey> {
  const owned = new Set<GeometryKey>()
  ownParent(node, parent, owned)
  ownText(node, owned)
  ownFlow(node, owned)
  return owned
}

function ownParent(node: GraphNode, parent: GraphNode | undefined, owned: Set<GeometryKey>): void {
  if (!parent || layoutMode(parent) === 'none' || isAbsolute(node)) return
  owned.add('x')
  owned.add('y')
  const mode = layoutMode(parent)
  if (mode === 'grid') {
    ownFilled(node, 'width', owned)
    ownFilled(node, 'height', owned)
    return
  }
  if (mode !== 'row' && mode !== 'column') return
  const primary: Axis = mode === 'row' ? 'width' : 'height'
  const counter: Axis = mode === 'row' ? 'height' : 'width'
  ownFilled(node, primary, owned)
  if (crossAlign(parent) === 'stretch') owned.add(counter)
}

function ownFilled(node: GraphNode, axis: Axis, owned: Set<GeometryKey>): void {
  if (sizeSpec(node.fields[axis], layoutMode(node) !== 'none').mode === 'fill') owned.add(axis)
}

function ownText(node: GraphNode, owned: Set<GeometryKey>): void {
  if (node.type !== 'text' && node.type !== 'icon_font') return
  const growth = node.fields.textGrowth
  const mode = typeof growth === 'string' ? growth : 'auto'
  if (mode === 'auto') {
    owned.add('width')
    owned.add('height')
    return
  }
  if (mode === 'fixed-width') owned.add('height')
}

function ownFlow(node: GraphNode, owned: Set<GeometryKey>): void {
  const mode = layoutMode(node)
  if (mode !== 'row' && mode !== 'column') return
  if (sizeSpec(node.fields.width, true).mode !== 'fixed') owned.add('width')
  if (sizeSpec(node.fields.height, true).mode !== 'fixed') owned.add('height')
}

function isPluralControlWord(word: string): boolean {
  return word.endsWith('s') && CONTROL_WORDS.has(word.slice(0, -1))
}

function isInteractive(name: string): boolean {
  return nameWords(name).some((word) => CONTROL_WORDS.has(word) || isPluralControlWord(word))
}

function pluralGroup(name: string, childCount: number): boolean {
  if (childCount < 2) return false
  const words = nameWords(name)
  return words.some(isPluralControlWord) && !words.some((word) => CONTROL_WORDS.has(word))
}

function nestedInControl(node: GraphNode, nodes: ReadonlyMap<string, GraphNode>): boolean {
  const seen = new Set<string>([node.id])
  let parentId = node.parentId
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = nodes.get(parentId)
    if (!parent) return false
    if (isInteractive(layerName(parent)) && !pluralGroup(layerName(parent), parent.childIds.length)) {
      return true
    }
    parentId = parent.parentId
  }
  return false
}

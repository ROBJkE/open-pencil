import type { GraphNode, JSONValue } from '@open-pencil/session'

export interface Channels {
  red: number
  green: number
  blue: number
  alpha: number
}

export interface GradientStop extends Channels {
  position: number
}

export interface SolidPaint extends Channels {
  kind: 'solid'
}

export interface LinearGradient {
  kind: 'linear'
  x0: number
  y0: number
  x1: number
  y1: number
  stops: GradientStop[]
}

export interface RadialGradient {
  kind: 'radial'
  cx: number
  cy: number
  rx: number
  ry: number
  stops: GradientStop[]
}

export interface SweepGradient {
  kind: 'sweep'
  cx: number
  cy: number
  startAngle: number
  stops: GradientStop[]
}

export type DrawnPaint = SolidPaint | LinearGradient | RadialGradient | SweepGradient

export interface DrawnStroke {
  paint: DrawnPaint
  width: number
  align: 'center' | 'inside' | 'outside'
  cap: 'butt' | 'round' | 'square'
  join: 'miter' | 'bevel' | 'round'
}

export interface DrawnNode {
  id: string
  kind: 'rect' | 'ellipse' | 'line'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  clip: boolean
  radii: readonly [number, number, number, number]
  fills: readonly DrawnPaint[]
  strokes: readonly DrawnStroke[]
  children: readonly DrawnNode[]
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  if (value > 1) return 1
  return value
}

function readNumber(value: JSONValue | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function readSize(value: JSONValue | undefined): number {
  const size = readNumber(value, 0)
  return size > 0 ? size : 0
}

function enabled(value: JSONValue | undefined): boolean {
  if (value === false || value === 'false') return false
  return true
}

function asRecord(value: JSONValue): Record<string, JSONValue> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value
}

function expandShortHex(body: string): string {
  let expanded = ''
  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index)
    expanded = `${expanded}${char}${char}`
  }
  return expanded
}

function parseHex(hex: string): Channels | null {
  const body = /^[0-9a-fA-F]+$/.test(hex) ? hex : null
  if (!body) return null
  const expanded = body.length === 3 || body.length === 4 ? expandShortHex(body) : body
  if (expanded.length !== 6 && expanded.length !== 8) return null
  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
  return { red, green, blue, alpha }
}

function parseColor(input: string): Channels | null {
  const text = input.trim()
  if (!text.startsWith('#')) return null
  return parseHex(text.slice(1))
}

function solidPaint(input: string): SolidPaint | null {
  const color = parseColor(input)
  if (!color) return null
  return { kind: 'solid', ...color }
}

function recordNumber(value: JSONValue | undefined, key: string, fallback: number): number {
  const record = value === undefined ? null : asRecord(value)
  if (!record) return fallback
  return readNumber(record[key], fallback)
}

function gradientStops(value: JSONValue | undefined, opacity: number): GradientStop[] {
  if (!Array.isArray(value)) return []
  const stops: GradientStop[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record || typeof record.color !== 'string') continue
    const color = parseColor(record.color)
    if (!color) continue
    stops.push({
      ...color,
      alpha: color.alpha * clamp01(opacity),
      position: readNumber(record.position, 0)
    })
  }
  return stops
}

function linearEnds(
  centerX: number,
  centerY: number,
  sizeHeight: number,
  rotation: number
): Pick<LinearGradient, 'x0' | 'y0' | 'x1' | 'y1'> {
  const angle = (rotation * Math.PI) / 180
  const upX = -Math.sin(angle)
  const upY = -Math.cos(angle)
  const half = sizeHeight / 2
  return {
    x0: centerX + upX * -half,
    y0: centerY + upY * -half,
    x1: centerX + upX * half,
    y1: centerY + upY * half
  }
}

function gradientPaint(record: Record<string, JSONValue>): DrawnPaint | null {
  const stops = gradientStops(record.colors, readNumber(record.opacity, 1))
  if (stops.length === 0) return null
  const centerX = recordNumber(record.center, 'x', 0.5)
  const centerY = recordNumber(record.center, 'y', 0.5)
  const sizeWidth = recordNumber(record.size, 'width', 1)
  const sizeHeight = recordNumber(record.size, 'height', 1)
  const rotation = readNumber(record.rotation, 0)
  const gradientType = record.gradientType ?? 'linear'
  if (gradientType === 'radial') {
    return { kind: 'radial', cx: centerX, cy: centerY, rx: sizeWidth / 2, ry: sizeHeight / 2, stops }
  }
  if (gradientType === 'angular') {
    return { kind: 'sweep', cx: centerX, cy: centerY, startAngle: -90 - rotation, stops }
  }
  if (gradientType !== 'linear') return null
  return { kind: 'linear', ...linearEnds(centerX, centerY, sizeHeight, rotation), stops }
}

function paintOf(value: JSONValue): DrawnPaint | null {
  if (typeof value === 'string') return solidPaint(value)
  const record = asRecord(value)
  if (!record || !enabled(record.enabled)) return null
  if (record.type === 'gradient') return gradientPaint(record)
  if (record.type === 'color' && typeof record.color === 'string') return solidPaint(record.color)
  return null
}

function paintsOf(value: JSONValue | undefined): DrawnPaint[] {
  if (value === undefined) return []
  const entries = Array.isArray(value) ? value : [value]
  const paints: DrawnPaint[] = []
  for (const entry of entries) {
    const paint = paintOf(entry)
    if (paint) paints.push(paint)
  }
  return paints
}

function sideWidth(value: JSONValue | undefined): number {
  if (value === undefined) return 0
  const record = asRecord(value)
  if (!record) return readNumber(value, 0)
  return Math.max(
    readNumber(record.top, 0),
    readNumber(record.right, 0),
    readNumber(record.bottom, 0),
    readNumber(record.left, 0)
  )
}

function alignmentOf(value: JSONValue | undefined): DrawnStroke['align'] {
  if (value === 'inner' || value === 'inside') return 'inside'
  if (value === 'outer' || value === 'outside') return 'outside'
  return 'center'
}

function capOf(value: JSONValue | undefined): DrawnStroke['cap'] {
  if (value === 'round') return 'round'
  if (value === 'square') return 'square'
  return 'butt'
}

function joinOf(value: JSONValue | undefined): DrawnStroke['join'] {
  if (value === 'bevel') return 'bevel'
  if (value === 'round') return 'round'
  return 'miter'
}

function strokesFrom(
  paints: JSONValue | undefined,
  width: number,
  align: DrawnStroke['align'],
  cap: DrawnStroke['cap'],
  join: DrawnStroke['join']
): DrawnStroke[] {
  if (!(width > 0)) return []
  return paintsOf(paints).map((paint) => ({ paint, width, align, cap, join }))
}

function strokesOf(fields: Record<string, JSONValue>): DrawnStroke[] {
  const stroke = fields.stroke
  const legacy = asRecord(stroke)
  if (legacy && 'thickness' in legacy && !('type' in legacy)) {
    return strokesFrom(
      legacy.fill,
      sideWidth(legacy.thickness),
      alignmentOf(legacy.align),
      capOf(legacy.cap),
      joinOf(legacy.join)
    )
  }
  return strokesFrom(
    stroke,
    sideWidth(fields.strokeWidth),
    alignmentOf(fields.strokeAlignment),
    capOf(fields.strokeLinecap),
    joinOf(fields.strokeLinejoin)
  )
}

function radiiOf(value: JSONValue | undefined): readonly [number, number, number, number] {
  if (Array.isArray(value)) {
    return [readSize(value[0]), readSize(value[1]), readSize(value[2]), readSize(value[3])]
  }
  const radius = readSize(value)
  return [radius, radius, radius, radius]
}

function kindOf(type: string): DrawnNode['kind'] {
  if (type === 'ellipse') return 'ellipse'
  if (type === 'line') return 'line'
  return 'rect'
}

function drawTree(
  node: GraphNode,
  byId: ReadonlyMap<string, GraphNode>,
  seen: Set<string>
): DrawnNode | null {
  if (seen.has(node.id)) return null
  seen.add(node.id)
  if (!enabled(node.fields.enabled)) return null
  const opacity = clamp01(readNumber(node.fields.opacity, 1))
  if (opacity <= 0) return null
  const children: DrawnNode[] = []
  for (const childId of node.childIds) {
    const child = byId.get(childId)
    if (!child) continue
    const drawn = drawTree(child, byId, seen)
    if (drawn) children.push(drawn)
  }
  return {
    id: node.id,
    kind: kindOf(node.type),
    x: readNumber(node.fields.x, 0),
    y: readNumber(node.fields.y, 0),
    width: readSize(node.fields.width),
    height: readSize(node.fields.height),
    rotation: readNumber(node.fields.rotation, 0),
    opacity,
    clip: node.fields.clip === true || node.fields.clip === 'true',
    radii: radiiOf(node.fields.cornerRadius),
    fills: paintsOf(node.fields.fill),
    strokes: strokesOf(node.fields),
    children
  }
}

/** Drawable tree in parent-local coordinates. Hidden nodes and their children are omitted. */
export function sceneFromNodes(nodes: readonly GraphNode[]): DrawnNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  const drawn: DrawnNode[] = []
  for (const node of nodes) {
    if (node.parentId !== null && byId.has(node.parentId)) continue
    const tree = drawTree(node, byId, seen)
    if (tree) drawn.push(tree)
  }
  return drawn
}

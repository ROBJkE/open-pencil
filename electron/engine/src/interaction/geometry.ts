import type { Point, Rect } from './types'

/** A press shorter than this on both axes is a click, as the drawing tools treat it. */
export const CLICK_EXTENT = 2

/** The square a click places for a box tool. */
const DEFAULT_EXTENT = 100

/** A click on the line tool places a horizontal line of this length. */
const DEFAULT_LINE_LENGTH = 100

/** A click on the text tool. Matches the editor's default text size. */
const TEXT_CLICK_WIDTH = 200
const TEXT_CLICK_HEIGHT = 24

/** Shift snaps a line to this many degrees. */
const LINE_STEP = 45

export interface PlacedBox extends Rect {
  readonly clicked: boolean
}

export interface PlacedLine extends PlacedBox {
  readonly rotation: number
}

export function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

/** Axis-aligned bounds. A negative width or height is flipped into the positive rectangle. */
export function boundsOf(x: number, y: number, width: number, height: number): Rect | null {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null
  }
  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height)
  }
}

/** Inclusive, so a point on the edge — including a zero-thickness line — hits. */
export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height
}

export function intersects(left: Rect, right: Rect): boolean {
  return (
    left.x <= right.x + right.width &&
    right.x <= left.x + left.width &&
    left.y <= right.y + right.height &&
    right.y <= left.y + left.height
  )
}

/** The box a drag creates. A click becomes the default square. Shift uses the longer side. */
export function draggedBox(from: Point, to: Point, constrain: boolean): PlacedBox | null {
  if (!finitePoint(from) || !finitePoint(to)) return null
  const rawWidth = to.x - from.x
  const rawHeight = to.y - from.y
  if (Math.abs(rawWidth) < CLICK_EXTENT && Math.abs(rawHeight) < CLICK_EXTENT) {
    return { x: from.x, y: from.y, width: DEFAULT_EXTENT, height: DEFAULT_EXTENT, clicked: true }
  }
  const size = Math.max(Math.abs(rawWidth), Math.abs(rawHeight))
  const width = constrain ? Math.sign(rawWidth) * size : rawWidth
  const height = constrain ? Math.sign(rawHeight) * size : rawHeight
  return {
    x: width < 0 ? from.x + width : from.x,
    y: height < 0 ? from.y + height : from.y,
    width: Math.abs(width),
    height: Math.abs(height),
    clicked: false
  }
}

export function textClickBox(from: Point): PlacedBox {
  return {
    x: from.x,
    y: from.y,
    width: TEXT_CLICK_WIDTH,
    height: TEXT_CLICK_HEIGHT,
    clicked: true
  }
}

/** A line is its length and angle from the press, not a box. Shift snaps the angle, not the length. */
export function lineBox(from: Point, to: Point, constrain: boolean): PlacedLine | null {
  if (!finitePoint(from) || !finitePoint(to)) return null
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length < CLICK_EXTENT) {
    return {
      x: from.x,
      y: from.y,
      width: DEFAULT_LINE_LENGTH,
      height: 0,
      rotation: 0,
      clicked: true
    }
  }
  let rotation = (Math.atan2(dy, dx) * 180) / Math.PI
  if (constrain) rotation = Math.round(rotation / LINE_STEP) * LINE_STEP
  return { x: from.x, y: from.y, width: length, height: 0, rotation, clicked: false }
}

/** The drag's real span, with no default size substituted for a click. */
export function spanBox(from: Point, to: Point): Rect | null {
  if (!finitePoint(from) || !finitePoint(to)) return null
  const width = to.x - from.x
  const height = to.y - from.y
  return {
    x: width < 0 ? from.x + width : from.x,
    y: height < 0 ? from.y + height : from.y,
    width: Math.abs(width),
    height: Math.abs(height)
  }
}

export function pathBounds(points: readonly Point[]): Rect | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (!finitePoint(point)) return null
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** SVG path in the points' own coordinates. A closed path needs more than two points. */
export function pathGeometry(points: readonly Point[], closed: boolean): string {
  const commands: string[] = []
  for (const point of points) {
    if (!finitePoint(point)) return ''
    const command = commands.length === 0 ? 'M' : 'L'
    commands.push(`${command} ${point.x} ${point.y}`)
  }
  if (commands.length === 0) return ''
  if (closed && points.length > 2) commands.push('Z')
  return commands.join(' ')
}

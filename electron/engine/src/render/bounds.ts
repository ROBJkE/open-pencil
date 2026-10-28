import type { TileRect } from '@open-pencil/session'

import type { DrawnNode, DrawnStroke } from './scene'

export interface NodeStamp {
  content: string
  rect: TileRect
}

interface Affine {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function translation(x: number, y: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y }
}

function multiply(left: Affine, right: Affine): Affine {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  }
}

/** Positive degrees match CanvasKit: clockwise on a y-down canvas, about the node's center. */
function rotation(degrees: number, cx: number, cy: number): Affine {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const spun: Affine = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
  return multiply(multiply(translation(cx, cy), spun), translation(-cx, -cy))
}

function place(parent: Affine, node: DrawnNode): Affine {
  const moved = multiply(parent, translation(node.x, node.y))
  if (node.rotation === 0) return moved
  return multiply(moved, rotation(node.rotation, node.width / 2, node.height / 2))
}

function apply(matrix: Affine, x: number, y: number): readonly [number, number] {
  return [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f]
}

function boundsOf(matrix: Affine, node: DrawnNode): TileRect {
  const corners = [
    apply(matrix, 0, 0),
    apply(matrix, node.width, 0),
    apply(matrix, node.width, node.height),
    apply(matrix, 0, node.height)
  ]
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const [x, y] of corners) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function unionRect(left: TileRect, right: TileRect): TileRect {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const maxX = Math.max(left.x + left.width, right.x + right.width)
  const maxY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: maxX - x, height: maxY - y }
}

function strokeReach(align: DrawnStroke['align'], width: number): number {
  if (align === 'outside') return width
  if (align === 'center') return width / 2
  return 0
}

function strokePad(node: DrawnNode): number {
  let pad = 1
  for (const stroke of node.strokes) {
    const reach = strokeReach(stroke.align, stroke.width) + 1
    if (reach > pad) pad = reach
  }
  return pad
}

function pad(rect: TileRect, amount: number): TileRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2
  }
}

function contentKey(node: DrawnNode): string {
  return JSON.stringify({
    kind: node.kind,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    opacity: node.opacity,
    clip: node.clip,
    radii: node.radii,
    fills: node.fills,
    strokes: node.strokes,
    children: node.children.map((child) => child.id)
  })
}

function walk(node: DrawnNode, matrix: Affine, into: Map<string, NodeStamp>): TileRect {
  const local = place(matrix, node)
  let union = boundsOf(local, node)
  for (const child of node.children) union = unionRect(union, walk(child, local, into))
  const rect = pad(union, strokePad(node))
  into.set(node.id, { content: contentKey(node), rect })
  return rect
}

/** World bounds and a content key for every drawn node, including descendants. */
export function nodeStamps(nodes: readonly DrawnNode[]): Map<string, NodeStamp> {
  const stamps = new Map<string, NodeStamp>()
  for (const node of nodes) walk(node, IDENTITY, stamps)
  return stamps
}

export function stampRect(stamps: ReadonlyMap<string, NodeStamp>): TileRect | null {
  let union: TileRect | null = null
  for (const stamp of stamps.values()) union = union ? unionRect(union, stamp.rect) : stamp.rect
  return union
}

function sameRect(left: TileRect, right: TileRect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

/** World rects whose pixels can change between two stamp maps. Each moved node contributes both rects. */
export function changedRects(
  previous: ReadonlyMap<string, NodeStamp>,
  next: ReadonlyMap<string, NodeStamp>
): TileRect[] {
  const rects: TileRect[] = []
  for (const [id, before] of previous) {
    const after = next.get(id)
    if (!after) {
      rects.push(before.rect)
      continue
    }
    if (before.content === after.content && sameRect(before.rect, after.rect)) continue
    rects.push(before.rect)
    if (!sameRect(before.rect, after.rect)) rects.push(after.rect)
  }
  for (const [id, after] of next) {
    if (!previous.has(id)) rects.push(after.rect)
  }
  return rects
}

import type { JSONValue } from '@open-pencil/session'

/** Affine matching CanvasKit: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export interface Affine {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

export interface PlacementBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}

export interface PlacedNode {
  readonly parentId: string | null
  readonly fields: Record<string, JSONValue>
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Point {
  readonly x: number
  readonly y: number
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function finite(value: JSONValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function placementBox(fields: Record<string, JSONValue>): PlacementBox | null {
  const x = finite(fields.x)
  const y = finite(fields.y)
  const width = finite(fields.width)
  const height = finite(fields.height)
  if (x === null || y === null || width === null || height === null) return null
  return { x, y, width, height, rotation: finite(fields.rotation) ?? 0 }
}

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

export function placed(parent: Affine, node: PlacementBox): Affine {
  const moved = multiply(parent, translation(node.x, node.y))
  if (node.rotation === 0) return moved
  return multiply(moved, rotation(node.rotation, node.width / 2, node.height / 2))
}

function apply(matrix: Affine, x: number, y: number): readonly [number, number] {
  return [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f]
}

function compose(boxes: readonly PlacementBox[]): Affine {
  let matrix: Affine = IDENTITY
  for (const box of boxes) matrix = placed(matrix, box)
  return matrix
}

export function axisAlignedBounds(matrix: Affine, width: number, height: number): Rect {
  const corners = [
    apply(matrix, 0, 0),
    apply(matrix, width, 0),
    apply(matrix, width, height),
    apply(matrix, 0, height)
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

export function worldRect(ancestors: readonly PlacementBox[], node: PlacementBox): Rect {
  return axisAlignedBounds(placed(compose(ancestors), node), node.width, node.height)
}

/** World position of the local point `(x, y)` after ancestor placement, before this node's rotation. */
export function worldOrigin(
  ancestors: readonly PlacementBox[],
  x: number,
  y: number
): readonly [number, number] {
  return apply(compose(ancestors), x, y)
}

function localPoint(parent: Affine, worldX: number, worldY: number): Point | null {
  const det = parent.a * parent.d - parent.c * parent.b
  if (det === 0 || !Number.isFinite(det)) return null
  const dx = worldX - parent.e
  const dy = worldY - parent.f
  const x = (parent.d * dx - parent.c * dy) / det
  const y = (parent.a * dy - parent.b * dx) / det
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/** Local origin that keeps `(x, y)` in the same world place under `newAncestors`. */
export function localKeepingOrigin(
  oldAncestors: readonly PlacementBox[],
  newAncestors: readonly PlacementBox[],
  x: number,
  y: number
): Point | null {
  const [worldX, worldY] = worldOrigin(oldAncestors, x, y)
  return localPoint(compose(newAncestors), worldX, worldY)
}

/** Ancestor boxes from the root down to `parentId`, skipping nodes with no geometry. */
export function ancestorBoxes(
  parentId: string | null,
  read: (id: string) => PlacedNode | undefined
): PlacementBox[] {
  const ids: string[] = []
  const seen = new Set<string>()
  let current = parentId
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    ids.push(current)
    current = read(current)?.parentId ?? null
  }
  const boxes: PlacementBox[] = []
  for (const id of ids.toReversed()) {
    const node = read(id)
    if (!node) continue
    const box = placementBox(node.fields)
    if (box) boxes.push(box)
  }
  return boxes
}

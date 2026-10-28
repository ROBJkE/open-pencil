export interface Point {
  readonly x: number
  readonly y: number
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function rotatePoint(px: number, py: number, cx: number, cy: number, radians: number): Point {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos
  }
}

/** Corners of a box rotated around its centre, in the same space as `x` and `y`. */
export function boxCorners(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number
): Point[] {
  const cx = x + width / 2
  const cy = y + height / 2
  const hw = width / 2
  const hh = height / 2
  const radians = degreesToRadians(rotation)
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return [
    { x: cx + -hw * cos - -hh * sin, y: cy + -hw * sin + -hh * cos },
    { x: cx + hw * cos - -hh * sin, y: cy + hw * sin + -hh * cos },
    { x: cx + hw * cos - hh * sin, y: cy + hw * sin + hh * cos },
    { x: cx + -hw * cos - hh * sin, y: cy + -hw * sin + hh * cos }
  ]
}

export function polygonArea(polygon: readonly Point[]): number {
  let twice = 0
  for (const [index, point] of polygon.entries()) {
    const next = polygon[(index + 1) % polygon.length]
    twice += point.x * next.y - next.x * point.y
  }
  return Math.abs(twice) / 2
}

/**
 * Clips `subject` to the convex polygon `clip`. Returns null when the subject
 * is fully outside. Fewer than three clip points leaves the subject unchanged.
 */
export function clipPolygon(subject: readonly Point[], clip: readonly Point[]): Point[] | null {
  if (clip.length < 3) return [...subject]
  const center = centroid(clip)
  let polygon = [...subject]
  for (let index = 0; index < clip.length; index += 1) {
    if (polygon.length === 0) return null
    const start = clip[index]
    const end = clip[(index + 1) % clip.length]
    const positive = cross(start, end, center) >= 0
    polygon = clipHalfPlane(polygon, start, end, positive)
  }
  return polygon.length === 0 ? null : polygon
}

function centroid(points: readonly Point[]): Point {
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length }
}

function cross(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
}

function clipHalfPlane(polygon: readonly Point[], a: Point, b: Point, wantPositive: boolean): Point[] {
  const output: Point[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[index === 0 ? polygon.length - 1 : index - 1]
    const currentInside = inside(current, a, b, wantPositive)
    const previousInside = inside(previous, a, b, wantPositive)
    if (currentInside) {
      if (!previousInside) output.push(intersect(previous, current, a, b))
      output.push(current)
    } else if (previousInside) {
      output.push(intersect(previous, current, a, b))
    }
  }
  return output
}

function inside(point: Point, a: Point, b: Point, wantPositive: boolean): boolean {
  const value = cross(a, b, point)
  return wantPositive ? value >= 0 : value <= 0
}

function intersect(p1: Point, p2: Point, p3: Point, p4: Point): Point {
  const dx1 = p2.x - p1.x
  const dy1 = p2.y - p1.y
  const dx2 = p4.x - p3.x
  const dy2 = p4.y - p3.y
  const denom = dx1 * dy2 - dy1 * dx2
  if (denom === 0) return p1
  const t = ((p3.x - p1.x) * dy2 - (p3.y - p1.y) * dx2) / denom
  return { x: p1.x + t * dx1, y: p1.y + t * dy1 }
}

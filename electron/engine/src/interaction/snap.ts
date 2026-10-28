import type { BoundsEntry } from '@open-pencil/session'

import { finitePoint } from './geometry'
import type { Point, SnapGuide, SnapResult } from './types'

interface AxisMatch {
  distance: number
  position: number
  guides: SnapGuide[]
}

/**
 * Snaps `point` to the nearest vertical and horizontal bounds edges within `threshold`.
 * The two axes are independent. A tie keeps the earlier entry, and a node's start edge
 * before its end. Pass the index without the node being dragged; this function sees every entry.
 */
export function snap(entries: readonly BoundsEntry[], point: Point, threshold: number): SnapResult {
  if (!finitePoint(point) || !Number.isFinite(threshold) || threshold < 0) {
    return { point, dx: 0, dy: 0, guides: [] }
  }
  const horizontal = matchAxis(entries, point.x, 'x', threshold)
  const vertical = matchAxis(entries, point.y, 'y', threshold)
  const x = horizontal ? horizontal.position : point.x
  const y = vertical ? vertical.position : point.y
  return {
    point: { x, y },
    dx: x - point.x,
    dy: y - point.y,
    guides: [...(horizontal?.guides ?? []), ...(vertical?.guides ?? [])]
  }
}

function matchAxis(
  entries: readonly BoundsEntry[],
  value: number,
  axis: 'x' | 'y',
  threshold: number
): AxisMatch | null {
  let match: AxisMatch | null = null
  for (const entry of entries) {
    const start = axis === 'x' ? entry.x : entry.y
    const size = axis === 'x' ? entry.width : entry.height
    match = consider(match, entry.id, start, value, axis, threshold)
    const end = start + size
    if (end !== start) match = consider(match, entry.id, end, value, axis, threshold)
  }
  return match
}

function consider(
  match: AxisMatch | null,
  id: string,
  edge: number,
  value: number,
  axis: 'x' | 'y',
  threshold: number
): AxisMatch | null {
  if (!Number.isFinite(edge)) return match
  const distance = Math.abs(edge - value)
  if (distance > threshold) return match
  const guide = { axis, position: edge, id }
  if (!match || distance < match.distance) return { distance, position: edge, guides: [guide] }
  if (distance === match.distance && edge === match.position) {
    return { ...match, guides: [...match.guides, guide] }
  }
  return match
}

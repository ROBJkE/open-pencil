import type { BoundsEntry, SpatialDelta } from '@open-pencil/session'

import { boundsOf, contains, intersects } from './geometry'
import type { Rect } from './types'

/**
 * Topmost id whose bounds contain `(x, y)`.
 *
 * `entries` is paint order, back to front: the document replicates this coarse index
 * into the UI, and a pointer move hit-tests that copy here. Nothing is asked of the
 * document process. A miss is null. Edges count as inside.
 */
export function hitTest(entries: readonly BoundsEntry[], x: number, y: number): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    const rect = boundsOf(entry.x, entry.y, entry.width, entry.height)
    if (rect && contains(rect, x, y)) return entry.id
  }
  return null
}

/**
 * Ids whose bounds meet `rect`, topmost first.
 * The same local index as `hitTest`: a marquee does not ask the document which nodes it covers.
 */
export function hitsInRect(entries: readonly BoundsEntry[], rect: Rect): string[] {
  const area = boundsOf(rect.x, rect.y, rect.width, rect.height)
  if (!area) return []
  const hits: string[] = []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    const box = boundsOf(entry.x, entry.y, entry.width, entry.height)
    if (box && intersects(box, area)) hits.push(entry.id)
  }
  return hits
}

/**
 * Applies one spatial delta to a UI-side copy of the index.
 * Removals happen first. An upsert replaces an id where it already paints, and appends a new id
 * on top. The caller keeps the newest generation and drops an older delta; this copy does not.
 */
export function applySpatialDelta(
  entries: readonly BoundsEntry[],
  delta: SpatialDelta
): BoundsEntry[] {
  const removed = new Set(delta.remove)
  const next: BoundsEntry[] = []
  const indexById = new Map<string, number>()
  for (const entry of entries) {
    if (removed.has(entry.id)) continue
    const at = indexById.get(entry.id)
    if (at === undefined) {
      indexById.set(entry.id, next.length)
      next.push(entry)
    } else {
      next[at] = entry
    }
  }
  for (const entry of delta.upsert) {
    const at = indexById.get(entry.id)
    if (at === undefined) {
      indexById.set(entry.id, next.length)
      next.push(entry)
    } else {
      next[at] = entry
    }
  }
  return next
}

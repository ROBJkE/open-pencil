import type { CSSProperties } from 'vue'

import { MAX_LAYER_ROWS, type LayerRow } from '@open-pencil/session'

/** One layer-tree read. The view asks again as the user scrolls. */
export const LAYER_WINDOW_LIMIT = MAX_LAYER_ROWS

export const LAYER_ROW_HEIGHT = 24

const SCROLL_MARGIN = 20

export interface LayerScrollMetrics {
  scrollTop: number
  viewportHeight: number
}

export function isRootRow(row: LayerRow): boolean {
  return row.depth === 0
}

export function rowPlacement(offset: number, index: number, depth: number): CSSProperties {
  return {
    position: 'absolute',
    top: `${(offset + index) * LAYER_ROW_HEIGHT}px`,
    height: `${LAYER_ROW_HEIGHT}px`,
    left: `${depth * 12}px`,
    right: '0px'
  }
}

/**
 * Offset of the next layer-tree read, or null when the loaded window already
 * covers the rows on screen.
 */
export function nextLayerOffset(
  loadedOffset: number,
  loadedCount: number,
  total: number,
  scroll: LayerScrollMetrics
): number | null {
  const start = Math.max(0, Math.floor(scroll.scrollTop / LAYER_ROW_HEIGHT))
  const visible = Math.max(1, Math.ceil(Math.max(0, scroll.viewportHeight) / LAYER_ROW_HEIGHT))
  const end = Math.min(total, start + visible)
  const loadedEnd = loadedOffset + loadedCount
  if (loadedCount > 0 && start >= loadedOffset && end <= loadedEnd) return null
  if (loadedCount > 0 && loadedEnd >= total && start >= loadedOffset) return null
  const next = Math.max(0, start - SCROLL_MARGIN)
  if (next === loadedOffset && loadedCount > 0) return null
  return next
}

export function scrollMetrics(event: Event): LayerScrollMetrics | null {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return null
  return { scrollTop: target.scrollTop, viewportHeight: target.clientHeight }
}

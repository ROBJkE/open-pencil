import { MAX_LAYER_ROWS } from '@open-pencil/session'

export const LAYER_ROW_HEIGHT = 24

export interface RowWindow {
  offset: number
  limit: number
}

export function virtualWindow(
  scrollTop: number,
  viewportHeight: number,
  total: number,
  overscan = 4
): RowWindow {
  if (total <= 0) return { offset: 0, limit: 1 }
  const start = Math.max(0, Math.floor(scrollTop / LAYER_ROW_HEIGHT) - overscan)
  const count =
    Math.ceil(Math.max(viewportHeight, LAYER_ROW_HEIGHT) / LAYER_ROW_HEIGHT) + overscan * 2
  const offset = Math.min(start, total - 1)
  const limit = Math.min(MAX_LAYER_ROWS, Math.max(1, Math.min(count, total - offset)))
  return { offset, limit }
}

/**
 * Pages are the document roots. Layers are the children of the active page.
 * Each list has its own total, so the offset starts at zero for both.
 */
export function treeQuery(
  kind: 'pages' | 'layers',
  scrollTop: number,
  viewportHeight: number,
  total: number,
  pageId: string | null
): { parentId: string | null; offset: number; limit: number } {
  const window = virtualWindow(scrollTop, viewportHeight, total)
  if (kind === 'pages') return { parentId: null, offset: window.offset, limit: window.limit }
  return { parentId: pageId, offset: window.offset, limit: window.limit }
}

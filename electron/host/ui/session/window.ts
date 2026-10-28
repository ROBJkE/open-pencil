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
  const count = Math.ceil(Math.max(viewportHeight, LAYER_ROW_HEIGHT) / LAYER_ROW_HEIGHT) + overscan * 2
  const offset = Math.min(start, total - 1)
  const limit = Math.min(MAX_LAYER_ROWS, Math.max(1, Math.min(count, total - offset)))
  return { offset, limit }
}

/**
 * The replay tape stores pages as a prefix and the active page's layers after them.
 * Both panels read that one list; parentId is still sent for a live engine.
 */
export function replayTreeQuery(
  kind: 'pages' | 'layers',
  pageCount: number,
  scrollTop: number,
  viewportHeight: number,
  total: number,
  pageId: string | null
): { parentId: string | null; offset: number; limit: number } {
  const pages = Math.max(0, Math.min(pageCount, total))
  if (kind === 'pages') {
    const window = virtualWindow(scrollTop, viewportHeight, pages)
    return { parentId: null, offset: window.offset, limit: window.limit }
  }
  const layers = Math.max(0, total - pages)
  const window = virtualWindow(scrollTop, viewportHeight, layers)
  return { parentId: pageId, offset: pages + window.offset, limit: window.limit }
}

export function rowSpan(kind: 'pages' | 'layers', pageCount: number, total: number): number {
  const pages = Math.max(0, Math.min(pageCount, total))
  return kind === 'pages' ? pages : Math.max(0, total - pages)
}

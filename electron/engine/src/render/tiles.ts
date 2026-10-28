import { TILE_SIZE } from '@open-pencil/session'
import type { TileRect } from '@open-pencil/session'

import type { RenderViewport, TileSpan } from './types'

/**
 * Tile ids pack a row and a column. A viewport cannot be wide enough for the columns to collide.
 * Coverage is half-open: a rect that ends on a tile boundary does not include the next tile.
 */
const TILE_COLUMN_STRIDE = 1_048_576

interface IndexSpan {
  first: number
  last: number
}

function usable(viewport: RenderViewport): boolean {
  return (
    Number.isFinite(viewport.zoom) &&
    viewport.zoom !== 0 &&
    Number.isFinite(viewport.panX) &&
    Number.isFinite(viewport.panY) &&
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height) &&
    viewport.width > 0 &&
    viewport.height > 0
  )
}

function coverage(start: number, end: number, limit: number): IndexSpan | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(limit > 0)) return null
  const min = Math.min(start, end)
  const max = Math.max(start, end)
  if (!(max > min) || max <= 0 || min >= limit) return null
  const first = Math.max(0, Math.floor(min / TILE_SIZE))
  const last = Math.min(Math.ceil(limit / TILE_SIZE) - 1, Math.ceil(max / TILE_SIZE) - 1)
  if (last < first) return null
  return { first, last }
}

function tileSpan(column: number, row: number, viewport: RenderViewport): TileSpan | null {
  const widthLimit = Math.ceil(viewport.width)
  const heightLimit = Math.ceil(viewport.height)
  const x = column * TILE_SIZE
  const y = row * TILE_SIZE
  const width = Math.min(TILE_SIZE, widthLimit - x)
  const height = Math.min(TILE_SIZE, heightLimit - y)
  if (width <= 0 || height <= 0) return null
  return {
    id: row * TILE_COLUMN_STRIDE + column,
    rect: { x, y, width, height }
  }
}

/** Device tiles a world-space rect change invalidates inside the viewport. */
export function tilesInvalidatedBy(rect: TileRect, viewport: RenderViewport): TileSpan[] {
  if (!usable(viewport)) return []
  const columns = coverage(
    rect.x * viewport.zoom + viewport.panX,
    (rect.x + rect.width) * viewport.zoom + viewport.panX,
    viewport.width
  )
  const rows = coverage(
    rect.y * viewport.zoom + viewport.panY,
    (rect.y + rect.height) * viewport.zoom + viewport.panY,
    viewport.height
  )
  if (!columns || !rows) return []
  const tiles: TileSpan[] = []
  for (let row = rows.first; row <= rows.last; row += 1) {
    for (let column = columns.first; column <= columns.last; column += 1) {
      const tile = tileSpan(column, row, viewport)
      if (tile) tiles.push(tile)
    }
  }
  return tiles
}

/** Tiles that cover the viewport. Empty when the viewport cannot be rasterized. */
export function viewportTiles(viewport: RenderViewport): TileSpan[] {
  if (!usable(viewport)) return []
  return tilesInvalidatedBy(
    {
      x: -viewport.panX / viewport.zoom,
      y: -viewport.panY / viewport.zoom,
      width: viewport.width / viewport.zoom,
      height: viewport.height / viewport.zoom
    },
    viewport
  )
}

/** Union of `tilesInvalidatedBy` for each rect, one entry per tile id. */
export function tilesForRects(rects: readonly TileRect[], viewport: RenderViewport): TileSpan[] {
  const byId = new Map<number, TileSpan>()
  for (const rect of rects) {
    for (const tile of tilesInvalidatedBy(rect, viewport)) byId.set(tile.id, tile)
  }
  return [...byId.values()]
}

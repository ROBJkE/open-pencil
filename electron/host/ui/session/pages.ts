import type { LayerRow } from '@open-pencil/session'

const PAGE_TYPES = new Set(['page', 'canvas', 'CANVAS', 'PAGE'])

export function isPageRow(row: LayerRow): boolean {
  return PAGE_TYPES.has(row.type)
}

/** How many leading rows are pages. The replay tape keeps that prefix contiguous. */
export async function leadingPageCount(
  readRow: (offset: number) => Promise<LayerRow | undefined>,
  total: number
): Promise<number> {
  if (total <= 0) return 0
  const first = await readRow(0)
  if (!first || !isPageRow(first)) return 0
  let low = 1
  let high = total
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    const row = await readRow(mid)
    if (row && isPageRow(row)) low = mid + 1
    else high = mid
  }
  return low
}

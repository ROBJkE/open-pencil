import type { LayerDropPosition } from '@open-pencil/session'

export const LAYER_DRAG_THRESHOLD = 4

export function layerDragStarted(dx: number, dy: number): boolean {
  return dx * dx + dy * dy >= LAYER_DRAG_THRESHOLD * LAYER_DRAG_THRESHOLD
}

/**
 * Where a pointer `offsetY` pixels into a row of `rowHeight` drops.
 * The top and bottom quarters reorder. The middle of a container nests; otherwise the nearer edge.
 */
export function layerDropPosition(
  offsetY: number,
  rowHeight: number,
  container: boolean
): LayerDropPosition {
  if (!(rowHeight > 0) || !Number.isFinite(offsetY)) return container ? 'into' : 'before'
  const ratio = offsetY / rowHeight
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  if (container) return 'into'
  return ratio < 0.5 ? 'before' : 'after'
}

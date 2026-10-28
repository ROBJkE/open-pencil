import type { CanvasTool, Command } from '@open-pencil/session'

import { viewportCommand } from './commands'
import { CLICK_EXTENT, finitePoint, spanBox } from './geometry'
import type { DrawGesture, PanGesture, Viewport, ZoomGesture } from './types'

/** The editor's zoom range. A gesture outside it is clamped, not rejected. */
const MIN_ZOOM = 0.02
const MAX_ZOOM = 256

export function panCommands(tool: CanvasTool, gesture: PanGesture): Command[] {
  if (tool !== 'hand') return []
  if (!finiteViewport(gesture.viewport)) return []
  if (!Number.isFinite(gesture.dx) || !Number.isFinite(gesture.dy)) return []
  return [
    viewportCommand({
      zoom: gesture.viewport.zoom,
      panX: gesture.viewport.panX + gesture.dx,
      panY: gesture.viewport.panY + gesture.dy,
      width: gesture.viewport.width,
      height: gesture.viewport.height
    })
  ]
}

export function zoomCommands(tool: CanvasTool, gesture: ZoomGesture): Command[] {
  if (tool !== 'zoom') return []
  const viewport = gesture.viewport
  if (!finiteViewport(viewport) || !(viewport.zoom > 0)) return []
  if (!finitePoint(gesture.anchor) || !Number.isFinite(gesture.factor) || !(gesture.factor > 0)) {
    return []
  }
  const zoom = clampZoom(viewport.zoom * gesture.factor)
  const scale = zoom / viewport.zoom
  return [
    viewportCommand({
      zoom,
      panX: gesture.anchor.x - (gesture.anchor.x - viewport.panX) * scale,
      panY: gesture.anchor.y - (gesture.anchor.y - viewport.panY) * scale,
      width: viewport.width,
      height: viewport.height
    })
  ]
}

/** Fitting a drag in the view. A click, or a drag still in progress, changes nothing. */
export function zoomRectCommands(gesture: DrawGesture): Command[] {
  if (gesture.phase !== 'commit') return []
  const viewport = gesture.viewport
  if (!viewport || !finiteViewport(viewport) || viewport.width <= 0 || viewport.height <= 0) {
    return []
  }
  const rect = spanBox(gesture.from, gesture.to)
  if (!rect || rect.width < CLICK_EXTENT || rect.height < CLICK_EXTENT) return []
  const zoom = clampZoom(Math.min(viewport.width / rect.width, viewport.height / rect.height))
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  return [
    viewportCommand({
      zoom,
      panX: viewport.width / 2 - centerX * zoom,
      panY: viewport.height / 2 - centerY * zoom,
      width: viewport.width,
      height: viewport.height
    })
  ]
}

function finiteViewport(viewport: Viewport): boolean {
  return (
    Number.isFinite(viewport.zoom) &&
    Number.isFinite(viewport.panX) &&
    Number.isFinite(viewport.panY) &&
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height)
  )
}

function clampZoom(zoom: number): number {
  if (zoom < MIN_ZOOM) return MIN_ZOOM
  if (zoom > MAX_ZOOM) return MAX_ZOOM
  return zoom
}

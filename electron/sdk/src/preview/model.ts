import type { JSONValue, TileRect } from '@open-pencil/session'

/**
 * Live preview islands for the 15 behaviours the editor ships.
 *
 * A node is an island when `fields.behaviour` is a kind, or `{ kind }`, or when that field is
 * absent and `type` is a kind. `x`, `y`, `width`, and `height` are world pixels from the
 * document process. The screen rect is `world * zoom + pan`. A rect that misses the viewport
 * is left off the layer. The result has no document command.
 */

/** The behaviour set, in picker order. */
export const PREVIEW_KINDS = [
  'button',
  'textField',
  'textarea',
  'numberField',
  'toggle',
  'switch',
  'checkbox',
  'radio',
  'radioGroup',
  'toggleGroup',
  'slider',
  'progress',
  'tabs',
  'collapsible',
  'accordion'
] as const

export type PreviewKind = (typeof PREVIEW_KINDS)[number]

/** The overlay ignores hits so the canvas keeps them. */
export const PREVIEW_LAYER_POINTER_EVENTS = 'none'

/** A mounted control takes the hit. */
export const PREVIEW_CONTROL_POINTER_EVENTS = 'auto'

/**
 * Wheel gestures are not captured. The preview layer does not listen for them, so they
 * stay with the canvas.
 */
export const PREVIEW_CAPTURE_WHEEL = false

const PREVIEW_KIND_SET: ReadonlySet<string> = new Set(PREVIEW_KINDS)

export interface PreviewNode {
  id: string
  type: string
  fields: Readonly<Record<string, JSONValue>>
}

/** Pan and zoom of the last presented frame, in the same pixels the canvas shows. */
export interface PreviewViewport {
  zoom: number
  panX: number
  panY: number
  width: number
  height: number
}

export interface PreviewIsland {
  id: string
  kind: PreviewKind
  rect: TileRect
}

export interface PreviewSurface {
  pointerEvents: typeof PREVIEW_LAYER_POINTER_EVENTS
  controlPointerEvents: typeof PREVIEW_CONTROL_POINTER_EVENTS
  captureWheel: typeof PREVIEW_CAPTURE_WHEEL
  islands: PreviewIsland[]
}

function isPreviewKind(value: unknown): value is PreviewKind {
  return typeof value === 'string' && PREVIEW_KIND_SET.has(value)
}

function behaviourKind(value: JSONValue | undefined): PreviewKind | null {
  if (isPreviewKind(value)) return value
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return isPreviewKind(value.kind) ? value.kind : null
}

function kindOf(node: PreviewNode): PreviewKind | null {
  if (Object.hasOwn(node.fields, 'behaviour')) return behaviourKind(node.fields.behaviour)
  return isPreviewKind(node.type) ? node.type : null
}

function finiteNumber(value: JSONValue | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/** World bounds already laid out by the document process. Missing geometry is not on screen. */
function worldRect(fields: PreviewNode['fields']): TileRect | null {
  const x = finiteNumber(fields.x)
  const y = finiteNumber(fields.y)
  const width = finiteNumber(fields.width)
  const height = finiteNumber(fields.height)
  if (x === null || y === null || width === null || height === null) return null
  return { x, y, width, height }
}

function projectRect(rect: TileRect, viewport: PreviewViewport): TileRect {
  const x0 = rect.x * viewport.zoom + viewport.panX
  const y0 = rect.y * viewport.zoom + viewport.panY
  const x1 = (rect.x + rect.width) * viewport.zoom + viewport.panX
  const y1 = (rect.y + rect.height) * viewport.zoom + viewport.panY
  const x = Math.min(x0, x1)
  const y = Math.min(y0, y1)
  return { x, y, width: Math.max(x0, x1) - x, height: Math.max(y0, y1) - y }
}

function positiveArea(rect: TileRect): boolean {
  return rect.width > 0 && rect.height > 0 && Number.isFinite(rect.x) && Number.isFinite(rect.y)
}

/**
 * Half-open viewport coverage, matching the raster: a rect that only touches the far edge
 * is outside.
 */
function overlapsViewport(rect: TileRect, viewport: PreviewViewport): boolean {
  if (!positiveArea(rect)) return false
  if (!(viewport.width > 0) || !(viewport.height > 0)) return false
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return right > 0 && bottom > 0 && rect.x < viewport.width && rect.y < viewport.height
}

function islandFor(node: PreviewNode, viewport: PreviewViewport): PreviewIsland | null {
  const kind = kindOf(node)
  if (!kind) return null
  const world = worldRect(node.fields)
  if (!world) return null
  const rect = projectRect(world, viewport)
  if (!overlapsViewport(rect, viewport)) return null
  return { id: node.id, kind, rect }
}

function surface(islands: PreviewIsland[]): PreviewSurface {
  return {
    pointerEvents: PREVIEW_LAYER_POINTER_EVENTS,
    controlPointerEvents: PREVIEW_CONTROL_POINTER_EVENTS,
    captureWheel: PREVIEW_CAPTURE_WHEEL,
    islands
  }
}

/** On-screen controls for one presented frame. Input does not become a document command. */
export function previewIslands(
  nodes: readonly PreviewNode[],
  viewport: PreviewViewport
): PreviewSurface {
  const islands: PreviewIsland[] = []
  for (const node of nodes) {
    const island = islandFor(node, viewport)
    if (island) islands.push(island)
  }
  return surface(islands)
}

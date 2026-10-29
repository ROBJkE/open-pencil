import type { GraphNode, TilePixels, TileRect } from '@open-pencil/session'

/**
 * Viewport the raster maps into device pixels.
 * `navigating: true` keeps the last committed picture.
 * A `navigationGeneration` that differs from the last idle render does the same,
 * until a later call passes `navigating: false` and renders the exact picture.
 */
export interface RenderViewport {
  zoom: number
  panX: number
  panY: number
  width: number
  height: number
  navigating?: boolean
  navigationGeneration?: number
}

/** Sink for the dirty tiles of one document. */
export interface RenderTarget {
  documentId: string
  write(tiles: readonly TilePixels[]): void
}

/** One device tile. `rect` is in viewport pixels and may be smaller than a full tile at the edge. */
export interface TileSpan {
  id: number
  rect: TileRect
}

/**
 * Picture produced by one `renderScene` call.
 * `tiles` includes pixels that were already committed. Only rebuilt tiles are written to the target.
 */
export interface SceneRender {
  tiles: readonly TilePixels[]
  /** True when this call returned the previous picture and rebuilt no tiles. */
  reused: boolean
}

export interface SceneRenderer {
  renderScene(
    nodes: readonly GraphNode[],
    viewport: RenderViewport,
    target: RenderTarget
  ): SceneRender
  dispose(): void
}

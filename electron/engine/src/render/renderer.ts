import type { GraphNode, TilePixels, TileRect } from '@open-pencil/session'

import { changedRects, nodeStamps, stampRect, type NodeStamp } from './bounds'
import { createRasterHost, type RasterHost, type ScenePicture } from './cpu'
import { sceneFromNodes, type DrawnNode } from './scene'
import { tilesForRects, viewportTiles } from './tiles'
import type { RenderTarget, RenderViewport, SceneRender, SceneRenderer, TileSpan } from './types'

/**
 * Implemented paints: solid fills (hex colours and pen colour paints), linear gradients,
 * radial gradients, angular gradients, strokes with center, inside, and outside alignment,
 * node opacity, and rounded rectangles with one radius or four corners.
 * Rectangles, ellipses, and lines are drawn. A node with `clip` clips its children.
 *
 * Not implemented: image fills, shader and mesh gradients, effects, masks, blend modes,
 * booleans, and text.
 *
 * Navigation (`navigating: true`, or a `navigationGeneration` other than the last idle one)
 * returns the last committed picture and does not rebuild tiles. An idle call renders the
 * exact picture. Replacing the scene deletes the recorded picture. `dispose()` deletes that
 * picture and the CPU surface.
 */
class CpuSceneRenderer implements SceneRenderer {
  private picture: ScenePicture | null = null
  private stamps = new Map<string, NodeStamp>()
  private committed = new Map<number, TilePixels>()
  private viewportKey = ''
  private frameGeneration = 0
  private committedGeneration: number | null = null
  private disposed = false

  constructor(private readonly host: RasterHost) {}

  renderScene(
    nodes: readonly GraphNode[],
    viewport: RenderViewport,
    target: RenderTarget
  ): SceneRender {
    if (this.disposed) throw new Error('Scene renderer is disposed')
    if (this.reuse(viewport)) return { tiles: this.committedTiles(), reused: true }
    const changed = this.commitScene(sceneFromNodes(nodes))
    const written = this.rasterViewport(viewport, changed)
    if (written.length > 0) target.write(written)
    this.noteIdle(viewport)
    return { tiles: this.committedTiles(), reused: false }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    try {
      this.picture?.delete()
    } finally {
      this.picture = null
      this.committed.clear()
      this.stamps.clear()
      this.host.dispose()
    }
  }

  private reuse(viewport: RenderViewport): boolean {
    if (!this.picture) return false
    if (viewport.navigating === true) return true
    if (viewport.navigating === false) return false
    if (this.committedGeneration === null || viewport.navigationGeneration === undefined) return false
    return viewport.navigationGeneration !== this.committedGeneration
  }

  private commitScene(nodes: readonly DrawnNode[]): TileRect[] {
    const next = nodeStamps(nodes)
    const changed = changedRects(this.stamps, next)
    if (!this.picture || changed.length > 0 || this.stamps.size !== next.size) {
      const recorded = this.host.record(nodes, stampRect(next))
      const previous = this.picture
      this.picture = recorded
      previous?.delete()
    }
    this.stamps = next
    return changed
  }

  private rasterViewport(viewport: RenderViewport, changed: readonly TileRect[]): TilePixels[] {
    const visible = viewportTiles(viewport)
    const viewportChanged = this.viewportKey !== viewportKey(viewport)
    const dirty =
      this.committed.size === 0 || viewportChanged ? visible : tilesForRects(changed, viewport)
    const raster = includeMissing(visible, dirty, this.committed)
    const picture = this.picture
    if (!picture || raster.length === 0) {
      this.retainVisible(visible)
      this.viewportKey = viewportKey(viewport)
      return []
    }
    this.frameGeneration += 1
    const written = picture.raster(raster, viewport, this.frameGeneration)
    this.retainVisible(visible, written)
    this.viewportKey = viewportKey(viewport)
    return written
  }

  private retainVisible(visible: readonly TileSpan[], written: readonly TilePixels[] = []): void {
    const fresh = new Map(written.map((tile) => [tile.tile.id, tile]))
    const next = new Map<number, TilePixels>()
    for (const tile of visible) {
      const pixels = fresh.get(tile.id) ?? this.committed.get(tile.id)
      if (pixels) next.set(tile.id, pixels)
    }
    this.committed = next
  }

  private committedTiles(): TilePixels[] {
    return [...this.committed.values()].sort((left, right) => {
      const vertical = left.tile.rect.y - right.tile.rect.y
      if (vertical !== 0) return vertical
      return left.tile.rect.x - right.tile.rect.x
    })
  }

  private noteIdle(viewport: RenderViewport): void {
    if (viewport.navigating === true || viewport.navigationGeneration === undefined) return
    this.committedGeneration = viewport.navigationGeneration
  }
}

function viewportKey(viewport: RenderViewport): string {
  return `${viewport.zoom}\u0000${viewport.panX}\u0000${viewport.panY}\u0000${viewport.width}\u0000${viewport.height}`
}

function includeMissing(
  visible: readonly TileSpan[],
  dirty: readonly TileSpan[],
  committed: ReadonlyMap<number, TilePixels>
): TileSpan[] {
  const raster = [...dirty]
  const dirtyIds = new Set(dirty.map((tile) => tile.id))
  for (const tile of visible) {
    if (!committed.has(tile.id) && !dirtyIds.has(tile.id)) raster.push(tile)
  }
  return raster
}

export function createSceneRenderer(): Promise<SceneRenderer> {
  return createRasterHost().then((host) => new CpuSceneRenderer(host))
}

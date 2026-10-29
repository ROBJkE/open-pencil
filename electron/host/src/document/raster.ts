import { createSceneRenderer, type SceneRenderer } from '@open-pencil/engine'
import type { DocumentEngine, FrameUpdate, TilePixels } from '@open-pencil/session'

import type { DocumentTilePacket } from './protocol'

export interface DocumentRasterPush {
  frame(update: FrameUpdate): void
  tile(packet: DocumentTilePacket): void
}

/**
 * Paints one document after the command that changed it has already been acknowledged.
 * A zero-size viewport paints nothing. A later edit replaces an in-flight picture.
 */
export function createDocumentRaster(push: DocumentRasterPush) {
  let renderer: SceneRenderer | null = null
  let loading: Promise<SceneRenderer> | null = null
  let engine: DocumentEngine | null = null
  let running = false
  let queued = false
  let disposed = false
  let epoch = 0

  async function ensure(): Promise<SceneRenderer> {
    if (renderer) return renderer
    if (!loading) loading = createSceneRenderer()
    const created = await loading
    if (!renderer) renderer = created
    return renderer
  }

  async function paint(token: number, current: DocumentEngine): Promise<void> {
    const scene = await ensure()
    if (disposed || token !== epoch || engine !== current) return
    const viewport = current.readViewport()
    if (viewport.width <= 0 || viewport.height <= 0) return
    const nodes = current.checkpoint().nodes
    const pending: DocumentTilePacket[] = []
    try {
      const picture = scene.renderScene(
        nodes,
        {
          zoom: viewport.zoom,
          panX: viewport.panX,
          panY: viewport.panY,
          width: viewport.width,
          height: viewport.height
        },
        {
          documentId: current.id,
          write(tiles: readonly TilePixels[]) {
            for (const tile of tiles) {
              pending.push({
                type: 'tile',
                documentId: current.id,
                tile: tile.tile,
                pixels: new Uint8Array(tile.pixels)
              })
            }
          }
        }
      )
      if (disposed || token !== epoch || engine !== current) return
      push.frame({
        documentId: current.id,
        tiles: picture.tiles.map((tile) => tile.tile)
      })
      for (const packet of pending) push.tile(packet)
    } catch (error) {
      console.error('document raster failed', error)
    }
  }

  function pump(): void {
    const current = engine
    if (!current || disposed) return
    if (running) {
      queued = true
      return
    }
    const viewport = current.readViewport()
    if (viewport.width <= 0 || viewport.height <= 0) return
    const token = epoch
    running = true
    queued = false
    void paint(token, current).finally(() => {
      running = false
      if (!queued || disposed) return
      queued = false
      pump()
    })
  }

  return {
    schedule(next: DocumentEngine) {
      engine = next
      pump()
    },
    reset() {
      epoch += 1
      engine = null
      queued = false
      renderer?.dispose()
      renderer = null
      loading = null
    },
    dispose() {
      disposed = true
      this.reset()
    }
  }
}

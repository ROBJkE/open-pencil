import { TILE_SIZE, type TilePixels, type TileRect } from '@open-pencil/session'
import type { Canvas, CanvasKit, SkPicture, Surface } from 'canvaskit-wasm'

import { loadCanvasKit, makeCpuSurface } from './kit'
import { recordScene } from './record'
import type { DrawnNode } from './scene'
import type { RenderViewport, TileSpan } from './types'

export interface ScenePicture {
  raster(tiles: readonly TileSpan[], viewport: RenderViewport, generation: number): TilePixels[]
  delete(): void
}

/** CPU CanvasKit owner. A native Skia host can replace this without changing `SceneRenderer`. */
export interface RasterHost {
  record(nodes: readonly DrawnNode[], cull: TileRect | null): ScenePicture
  dispose(): void
}

function copyRgba(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const rowBytes = width * 4
  const tightBytes = rowBytes * height
  if (pixels.length === tightBytes) return new Uint8Array(pixels)
  if (height === 0 || pixels.length % height !== 0) {
    throw new Error('CanvasKit returned an unexpected RGBA stride')
  }
  const stride = pixels.length / height
  if (stride < rowBytes) throw new Error('CanvasKit returned a short RGBA row')
  const copy = new Uint8Array(tightBytes)
  for (let row = 0; row < height; row += 1) {
    copy.set(pixels.subarray(row * stride, row * stride + rowBytes), row * rowBytes)
  }
  return copy
}

function readRgba(ck: CanvasKit, canvas: Canvas, width: number, height: number): Uint8Array {
  const pixels = canvas.readPixels(0, 0, {
    width,
    height,
    colorType: ck.ColorType.RGBA_8888,
    alphaType: ck.AlphaType.Unpremul,
    colorSpace: ck.ColorSpace.SRGB
  })
  if (!(pixels instanceof Uint8Array)) throw new Error('CanvasKit did not return RGBA bytes')
  return copyRgba(pixels, width, height)
}

class CpuPicture implements ScenePicture {
  private picture: SkPicture | null

  constructor(
    private readonly ck: CanvasKit,
    private readonly surface: Surface,
    picture: SkPicture
  ) {
    this.picture = picture
  }

  raster(tiles: readonly TileSpan[], viewport: RenderViewport, generation: number): TilePixels[] {
    const picture = this.picture
    if (!picture) return []
    const canvas = this.surface.getCanvas()
    const written: TilePixels[] = []
    for (const tile of tiles) {
      canvas.clear(this.ck.Color4f(0, 0, 0, 0))
      canvas.save()
      canvas.translate(viewport.panX - tile.rect.x, viewport.panY - tile.rect.y)
      canvas.scale(viewport.zoom, viewport.zoom)
      canvas.drawPicture(picture)
      canvas.restore()
      this.surface.flush()
      written.push({
        tile: {
          id: tile.id,
          generation,
          rect: {
            x: tile.rect.x,
            y: tile.rect.y,
            width: tile.rect.width,
            height: tile.rect.height
          },
          encoding: 'rgba'
        },
        pixels: readRgba(this.ck, canvas, tile.rect.width, tile.rect.height)
      })
    }
    return written
  }

  delete(): void {
    this.picture?.delete()
    this.picture = null
  }
}

class CpuHost implements RasterHost {
  private readonly surface: Surface
  private disposed = false

  constructor(private readonly ck: CanvasKit) {
    this.surface = makeCpuSurface(ck, TILE_SIZE, TILE_SIZE)
  }

  record(nodes: readonly DrawnNode[], cull: TileRect | null): ScenePicture {
    if (this.disposed) throw new Error('Scene renderer is disposed')
    return new CpuPicture(this.ck, this.surface, recordScene(this.ck, nodes, cull))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.surface.delete()
  }
}

export function createRasterHost(): Promise<RasterHost> {
  return loadCanvasKit().then((ck) => new CpuHost(ck))
}

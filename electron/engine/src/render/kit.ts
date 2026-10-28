import CanvasKitInit from 'canvaskit-wasm'
import type { CanvasKit, Surface } from 'canvaskit-wasm'

let loading: Promise<CanvasKit> | null = null

export function loadCanvasKit(): Promise<CanvasKit> {
  if (!loading) {
    loading = CanvasKitInit({
      locateFile: (file) => new URL(file, import.meta.resolve('canvaskit-wasm')).href
    })
  }
  return loading
}

/** CPU raster surface. `MakeSurface` is software-backed; a GPU surface is rejected and deleted. */
export function makeCpuSurface(ck: CanvasKit, width: number, height: number): Surface {
  const surface = ck.MakeSurface(width, height)
  if (!surface) throw new Error('CanvasKit CPU surface is unavailable')
  if (surface.reportBackendTypeIsGPU()) {
    surface.delete()
    throw new Error('CanvasKit returned a GPU surface')
  }
  return surface
}

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import CanvasKitInit from 'canvaskit-wasm'
import type { CanvasKit, Surface } from 'canvaskit-wasm'

/**
 * The packaged worker keeps `canvaskit.wasm` beside `worker.cjs`.
 * A test run walks up to the installed package. `import.meta` is absent
 * because the utility-process bundle is CommonJS and cannot parse it.
 */
function searchRoots(): string[] {
  const roots = [resolve(process.cwd())]
  const entry = process.argv[1]
  if (typeof entry === 'string' && entry.length > 0) roots.unshift(dirname(resolve(entry)))
  return roots
}

function installedWasm(start: string): string | null {
  let dir = start
  for (let hop = 0; hop < 12; hop += 1) {
    const candidate = resolve(dir, 'node_modules', 'canvaskit-wasm', 'bin', 'canvaskit.wasm')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

function wasmFile(): URL {
  const entry = process.argv[1]
  if (typeof entry === 'string' && entry.length > 0) {
    const beside = resolve(dirname(entry), 'canvaskit.wasm')
    if (existsSync(beside)) return pathToFileURL(beside)
  }
  for (const root of searchRoots()) {
    const installed = installedWasm(root)
    if (installed) return pathToFileURL(installed)
  }
  throw new Error('canvaskit.wasm was not found')
}

let loading: Promise<CanvasKit> | null = null

export function loadCanvasKit(): Promise<CanvasKit> {
  if (!loading) {
    const wasm = wasmFile()
    loading = CanvasKitInit({
      locateFile: (file) => new URL(file, wasm).href
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

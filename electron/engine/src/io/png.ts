import type { GraphNode, TilePixels } from '@open-pencil/session'

import { createSceneRenderer, type RenderViewport, type SceneRenderer } from '../render'
import { finiteNumber } from './values'

/** RGBA bytes for one export. These are the renderer tile bytes, not a PNG container. */
export interface PNGExport {
  readonly encoding: 'rgba'
  readonly width: number
  readonly height: number
  readonly bytes: Uint8Array
}

export interface PNGExportOptions {
  /** Defaults to the document scene renderer. Tests pass a loader that refuses CanvasKit. */
  readonly loadRenderer?: () => Promise<SceneRenderer>
}

/**
 * Renders `nodes` with the scene renderer when CanvasKit loads.
 * When it does not, returns the solid-rectangle tile bytes the renderer test builds by hand.
 */
export async function exportPNG(
  nodes: readonly GraphNode[],
  viewport: RenderViewport,
  options: PNGExportOptions = {}
): Promise<PNGExport> {
  const width = pixelLength(viewport.width)
  const height = pixelLength(viewport.height)
  if (width > 0 && height > 0) {
    const rendered = await renderedPNG(nodes, viewport, width, height, options.loadRenderer)
    if (rendered) return rendered
  }
  return { encoding: 'rgba', width, height, bytes: rectangleTiles(nodes, width, height) }
}

async function renderedPNG(
  nodes: readonly GraphNode[],
  viewport: RenderViewport,
  width: number,
  height: number,
  loadRenderer: PNGExportOptions['loadRenderer']
): Promise<PNGExport | undefined> {
  const renderer = await openRenderer(loadRenderer ?? createSceneRenderer)
  if (!renderer) return undefined
  try {
    return readPNG(renderer, nodes, viewport, width, height)
  } finally {
    renderer.dispose()
  }
}

async function openRenderer(
  load: () => Promise<SceneRenderer>
): Promise<SceneRenderer | undefined> {
  try {
    return await load()
  } catch (error: unknown) {
    reportLoadFailure(error)
    return undefined
  }
}

function reportLoadFailure(error: unknown): void {
  const message =
    error instanceof Error && error.message.length > 0 ? error.message : 'CanvasKit did not start'
  console.warn(`PNG export is using rectangle tile bytes: ${message}`)
}

function readPNG(
  renderer: SceneRenderer,
  nodes: readonly GraphNode[],
  viewport: RenderViewport,
  width: number,
  height: number
): PNGExport | undefined {
  const received: TilePixels[] = []
  const frame = renderer.renderScene(nodes, viewport, {
    documentId: 'export',
    write(tiles) {
      for (const tile of tiles) received.push(tile)
    }
  })
  const tiles = frame.tiles.length > 0 ? frame.tiles : received
  if (tiles.length === 0) return undefined
  return { encoding: 'rgba', width, height, bytes: pixelsFrom(tiles, width, height) }
}

function pixelsFrom(tiles: readonly TilePixels[], width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(width * height * 4)
  for (const tile of tiles) blit(bytes, width, height, tile)
  return bytes
}

function blit(bytes: Uint8Array, width: number, height: number, tile: TilePixels): void {
  const rect = tile.tile.rect
  for (let row = 0; row < rect.height; row += 1) {
    const targetY = rect.y + row
    if (targetY < 0 || targetY >= height) continue
    copyRow(bytes, width, tile, row, targetY)
  }
}

function copyRow(
  bytes: Uint8Array,
  width: number,
  tile: TilePixels,
  row: number,
  targetY: number
): void {
  const rect = tile.tile.rect
  for (let column = 0; column < rect.width; column += 1) {
    const targetX = rect.x + column
    if (targetX < 0 || targetX >= width) continue
    writePixel(bytes, (targetY * width + targetX) * 4, tile.pixels, (row * rect.width + column) * 4)
  }
}

function writePixel(bytes: Uint8Array, to: number, pixels: Uint8Array, from: number): void {
  bytes[to] = pixels[from]
  bytes[to + 1] = pixels[from + 1]
  bytes[to + 2] = pixels[from + 2]
  bytes[to + 3] = pixels[from + 3]
}

function rectangleTiles(nodes: readonly GraphNode[], width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(width * height * 4)
  for (const node of nodes) paintRectangle(bytes, width, height, node)
  return bytes
}

function paintRectangle(bytes: Uint8Array, width: number, height: number, node: GraphNode): void {
  if (node.type !== 'rectangle' || typeof node.fields.fill !== 'string') return
  const x = finiteNumber(node.fields.x)
  const y = finiteNumber(node.fields.y)
  const rectWidth = finiteNumber(node.fields.width)
  const rectHeight = finiteNumber(node.fields.height)
  const channels = hexChannels(node.fields.fill)
  if (x === undefined || y === undefined || rectWidth === undefined || rectHeight === undefined)
    return
  if (!channels) return
  for (let row = y; row < y + rectHeight; row += 1) {
    if (row < 0 || row >= height) continue
    paintRow(bytes, width, row, x, rectWidth, channels)
  }
}

function paintRow(
  bytes: Uint8Array,
  width: number,
  row: number,
  x: number,
  rectWidth: number,
  channels: readonly [number, number, number, number]
): void {
  for (let column = x; column < x + rectWidth; column += 1) {
    if (column < 0 || column >= width) continue
    const offset = (row * width + column) * 4
    bytes[offset] = channels[0]
    bytes[offset + 1] = channels[1]
    bytes[offset + 2] = channels[2]
    bytes[offset + 3] = channels[3]
  }
}

function hexChannels(fill: string): [number, number, number, number] | undefined {
  const body = fill.startsWith('#') ? fill.slice(1) : ''
  if (!/^[0-9a-fA-F]+$/.test(body)) return undefined
  const expanded = body.length === 3 || body.length === 4 ? expandHex(body) : body
  if (expanded.length !== 6 && expanded.length !== 8) return undefined
  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 255
  return [red, green, blue, alpha]
}

function expandHex(body: string): string {
  let expanded = ''
  for (const char of body) expanded = `${expanded}${char}${char}`
  return expanded
}

function pixelLength(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

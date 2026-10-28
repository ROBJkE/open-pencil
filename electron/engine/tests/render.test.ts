import { describe, expect, test } from 'bun:test'

import {
  createSceneRenderer,
  tilesInvalidatedBy,
  viewportTiles,
  type RenderTarget,
  type RenderViewport,
  type SceneRenderer
} from '#engine/render/index'
import {
  createMemoryFrameTransport,
  TILE_SIZE,
  type GraphNode,
  type TilePixels
} from '@open-pencil/session'

import { compareRgba } from './fixtures.test'

const VIEW: RenderViewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
  width: 8,
  height: 8,
  navigationGeneration: 0
}

function rectangle(
  fields: GraphNode['fields'],
  id = 'rect',
  parentId: string | null = null
): GraphNode {
  return {
    id,
    type: 'rectangle',
    parentId,
    childIds: [],
    fields,
    passthrough: {}
  }
}

function solidBuffer(
  width: number,
  height: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  channels: readonly [number, number, number, number]
): Uint8Array {
  const buffer = new Uint8Array(width * height * 4)
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      const offset = (row * width + column) * 4
      buffer[offset] = channels[0]
      buffer[offset + 1] = channels[1]
      buffer[offset + 2] = channels[2]
      buffer[offset + 3] = channels[3]
    }
  }
  return buffer
}

function sink(): { target: RenderTarget; writes: TilePixels[][] } {
  const writes: TilePixels[][] = []
  return {
    writes,
    target: {
      documentId: 'doc',
      write(tiles) {
        writes.push([...tiles])
      }
    }
  }
}

async function openRenderer(): Promise<SceneRenderer | null> {
  try {
    return await createSceneRenderer()
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'CanvasKit did not start'
    expect(reason.length).toBeGreaterThan(0)
    return null
  }
}

describe('dirty tiles', () => {
  const wide: RenderViewport = { zoom: 1, panX: 0, panY: 0, width: TILE_SIZE * 2, height: TILE_SIZE * 2 }

  test('a rect inside one tile invalidates that tile', () => {
    const tiles = tilesInvalidatedBy({ x: 10, y: 20, width: 30, height: 40 }, wide)
    expect(tiles.map((tile) => tile.rect)).toEqual([{ x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE }])
    expect(tilesInvalidatedBy({ x: 10, y: 20, width: 30, height: 40 }, wide)).toEqual(tiles)
  })

  test('a rect that crosses a tile boundary invalidates each tile it covers', () => {
    const tiles = tilesInvalidatedBy(
      { x: TILE_SIZE - 10, y: TILE_SIZE - 4, width: 20, height: 12 },
      wide
    )
    expect(tiles.map((tile) => tile.rect)).toEqual([
      { x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE },
      { x: TILE_SIZE, y: 0, width: TILE_SIZE, height: TILE_SIZE },
      { x: 0, y: TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE },
      { x: TILE_SIZE, y: TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }
    ])
    expect(new Set(tiles.map((tile) => tile.id)).size).toBe(4)
  })

  test('a rect that ends on a tile boundary does not include the next tile', () => {
    const ending = tilesInvalidatedBy({ x: 200, y: 0, width: TILE_SIZE - 200, height: 10 }, wide)
    const starting = tilesInvalidatedBy({ x: TILE_SIZE, y: 0, width: 10, height: 10 }, wide)
    expect(ending.map((tile) => tile.rect.x)).toEqual([0])
    expect(starting.map((tile) => tile.rect.x)).toEqual([TILE_SIZE])
    expect(tilesInvalidatedBy({ x: 0, y: 0, width: 0, height: 10 }, wide)).toEqual([])
    expect(tilesInvalidatedBy({ x: wide.width, y: 0, width: 10, height: 10 }, wide)).toEqual([])
  })

  test('zoom and pan move the rect into device tiles', () => {
    const scaled = tilesInvalidatedBy(
      { x: 200, y: 0, width: 10, height: 10 },
      { zoom: 2, panX: 0, panY: 0, width: 512, height: 64 }
    )
    expect(scaled.map((tile) => tile.rect.x)).toEqual([TILE_SIZE])
    const panned = tilesInvalidatedBy(
      { x: 0, y: 0, width: 10, height: 10 },
      { zoom: 1, panX: 300, panY: 0, width: 512, height: 64 }
    )
    expect(panned.map((tile) => tile.rect.x)).toEqual([TILE_SIZE])
  })

  test('the viewport is covered by partial edge tiles', () => {
    expect(
      viewportTiles({ zoom: 1, panX: 0, panY: 0, width: TILE_SIZE + 20, height: 10 }).map(
        (tile) => tile.rect
      )
    ).toEqual([
      { x: 0, y: 0, width: TILE_SIZE, height: 10 },
      { x: TILE_SIZE, y: 0, width: 20, height: 10 }
    ])
  })
})

describe('cpu scene renderer', () => {
  test('a solid rectangle matches a hand-built buffer', async () => {
    const renderer = await openRenderer()
    if (!renderer) return
    const transport = createMemoryFrameTransport()
    const { target, writes } = sink()
    const publishing: RenderTarget = {
      documentId: 'doc',
      write(tiles) {
        target.write(tiles)
        transport.publish({
          documentId: 'doc',
          tiles: tiles.map((tile) => tile.tile),
          pixelTiles: [...tiles]
        })
      }
    }
    try {
      const frame = renderer.renderScene(
        [rectangle({ x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' })],
        VIEW,
        publishing
      )
      expect(frame.reused).toBe(false)
      expect(frame.tiles).toHaveLength(1)
      const actual = frame.tiles[0].pixels
      const expected = solidBuffer(8, 8, 2, 2, 4, 3, [255, 0, 0, 255])
      expect(compareRgba(actual, expected, 0)).toBe(0)
      expect(compareRgba(transport.pixels('doc', frame.tiles[0].tile.id) ?? new Uint8Array(), expected, 0)).toBe(
        0
      )
      const again = renderer.renderScene(
        [rectangle({ x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' })],
        VIEW,
        publishing
      )
      expect(writes).toHaveLength(1)
      expect(again.reused).toBe(false)
      expect(again.tiles[0].pixels).toBe(actual)
    } finally {
      renderer.dispose()
    }
  })

  test('a child is drawn in its parent coordinates', async () => {
    const renderer = await openRenderer()
    if (!renderer) return
    const { target } = sink()
    const parent: GraphNode = {
      id: 'frame',
      type: 'frame',
      parentId: null,
      childIds: ['rect'],
      fields: { x: 1, y: 0, width: 8, height: 8 },
      passthrough: {}
    }
    const child = rectangle({ x: 1, y: 2, width: 4, height: 3, fill: '#FF0000' }, 'rect', 'frame')
    try {
      const frame = renderer.renderScene([parent, child], VIEW, target)
      expect(compareRgba(frame.tiles[0].pixels, solidBuffer(8, 8, 2, 2, 4, 3, [255, 0, 0, 255]), 0)).toBe(
        0
      )
    } finally {
      renderer.dispose()
    }
  })

  test('navigation returns the committed picture and an idle call renders the exact one', async () => {
    const renderer = await openRenderer()
    if (!renderer) return
    const { target, writes } = sink()
    const node = rectangle({ x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' })
    try {
      const settled = renderer.renderScene([node], VIEW, target)
      const panning = renderer.renderScene([node], { ...VIEW, panX: 2, navigationGeneration: 1 }, target)
      expect(panning.reused).toBe(true)
      expect(writes).toHaveLength(1)
      expect(panning.tiles[0].pixels).toBe(settled.tiles[0].pixels)
      expect(compareRgba(panning.tiles[0].pixels, solidBuffer(8, 8, 2, 2, 4, 3, [255, 0, 0, 255]), 0)).toBe(
        0
      )

      const flagged = renderer.renderScene(
        [rectangle({ x: 2, y: 2, width: 4, height: 3, fill: '#0000FF' })],
        { ...VIEW, panX: 2, navigating: true },
        target
      )
      expect(flagged.reused).toBe(true)
      expect(writes).toHaveLength(1)
      expect(flagged.tiles[0].pixels).toBe(settled.tiles[0].pixels)

      const idle = renderer.renderScene(
        [rectangle({ x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' })],
        { ...VIEW, panX: 2, navigationGeneration: 1, navigating: false },
        target
      )
      expect(idle.reused).toBe(false)
      expect(writes).toHaveLength(2)
      expect(
        compareRgba(idle.tiles[0].pixels, solidBuffer(8, 8, 4, 2, 4, 3, [255, 0, 0, 255]), 0)
      ).toBe(0)
    } finally {
      renderer.dispose()
    }
  })

  test('an idle edit rebuilds the tiles the rect covers', async () => {
    const renderer = await openRenderer()
    if (!renderer) return
    const { target, writes } = sink()
    const viewport: RenderViewport = {
      zoom: 1,
      panX: 0,
      panY: 0,
      width: TILE_SIZE * 2,
      height: 16,
      navigationGeneration: 0
    }
    const left = rectangle({ x: 4, y: 2, width: 4, height: 4, fill: '#FF0000' }, 'left')
    const right = rectangle(
      { x: TILE_SIZE + 4, y: 2, width: 4, height: 4, fill: '#00FF00' },
      'right'
    )
    try {
      const first = renderer.renderScene([left, right], viewport, target)
      expect(writes[0]).toHaveLength(2)
      const kept = first.tiles.find((tile) => tile.tile.rect.x === 0)
      const edited = renderer.renderScene(
        [left, rectangle({ x: TILE_SIZE + 4, y: 2, width: 4, height: 4, fill: '#0000FF' }, 'right')],
        viewport,
        target
      )
      expect(writes[1]).toHaveLength(1)
      expect(writes[1][0].tile.rect.x).toBe(TILE_SIZE)
      const still = edited.tiles.find((tile) => tile.tile.rect.x === 0)
      expect(still?.pixels).toBe(kept?.pixels)
      const across = rectangle(
        { x: TILE_SIZE - 2, y: 2, width: 8, height: 4, fill: '#FF0000' },
        'across'
      )
      renderer.renderScene([across], viewport, target)
      const repaint = renderer.renderScene(
        [rectangle({ x: TILE_SIZE - 2, y: 2, width: 8, height: 4, fill: '#00FF00' }, 'across')],
        viewport,
        target
      )
      expect(repaint.reused).toBe(false)
      expect(writes[3]).toHaveLength(2)
    } finally {
      renderer.dispose()
    }
  })

  test('opacity, strokes, corners, ellipses, and gradients', async () => {
    const renderer = await openRenderer()
    if (!renderer) return
    const { target } = sink()
    try {
      const faded = renderer.renderScene(
        [rectangle({ x: 0, y: 0, width: 4, height: 4, fill: '#FF0000', opacity: 0.5 })],
        { ...VIEW, width: 4, height: 4 },
        target
      )
      const expected = new Uint8Array(4 * 4 * 4)
      for (let offset = 0; offset < expected.length; offset += 4) {
        expected[offset] = 255
        expected[offset + 3] = 128
      }
      expect(compareRgba(faded.tiles[0].pixels, expected, 0)).toBe(0)

      const stroked = renderer.renderScene(
        [rectangle({ x: 2, y: 2, width: 4, height: 4, stroke: '#000000', strokeWidth: 2 })],
        VIEW,
        target
      )
      const alphaAt = (pixels: Uint8Array, x: number, y: number) => pixels[(y * 8 + x) * 4 + 3]
      expect(alphaAt(stroked.tiles[0].pixels, 0, 0)).toBe(0)
      expect(alphaAt(stroked.tiles[0].pixels, 1, 1)).toBe(255)
      expect(alphaAt(stroked.tiles[0].pixels, 3, 3)).toBe(0)

      const inside = renderer.renderScene(
        [
          rectangle({
            x: 2,
            y: 2,
            width: 4,
            height: 4,
            stroke: '#0000FF',
            strokeWidth: 2,
            strokeAlignment: 'inside'
          })
        ],
        VIEW,
        target
      )
      expect(alphaAt(inside.tiles[0].pixels, 1, 2)).toBe(0)
      expect(inside.tiles[0].pixels[(2 * 8 + 2) * 4 + 2]).toBe(255)

      const outside = renderer.renderScene(
        [
          rectangle({
            x: 2,
            y: 2,
            width: 4,
            height: 4,
            stroke: '#0000FF',
            strokeWidth: 2,
            strokeAlignment: 'outside'
          })
        ],
        VIEW,
        target
      )
      expect(outside.tiles[0].pixels[(2 * 8 + 1) * 4 + 2]).toBe(255)
      expect(alphaAt(outside.tiles[0].pixels, 3, 3)).toBe(0)

      const rounded = renderer.renderScene(
        [rectangle({ x: 0, y: 0, width: 8, height: 8, fill: '#FF0000', cornerRadius: 4 })],
        VIEW,
        target
      )
      expect(rounded.tiles[0].pixels[3]).toBe(0)
      expect(rounded.tiles[0].pixels[(4 * 8 + 4) * 4 + 3]).toBe(255)

      const corners = renderer.renderScene(
        [rectangle({ x: 0, y: 0, width: 8, height: 8, fill: '#FF0000', cornerRadius: [6, 0, 0, 0] })],
        VIEW,
        target
      )
      expect(alphaAt(corners.tiles[0].pixels, 0, 0)).toBe(0)
      expect(alphaAt(corners.tiles[0].pixels, 7, 0)).toBe(255)

      const ellipse = renderer.renderScene(
        [
          {
            id: 'ellipse',
            type: 'ellipse',
            parentId: null,
            childIds: [],
            fields: { x: 0, y: 0, width: 8, height: 8, fill: '#FF0000' },
            passthrough: {}
          }
        ],
        VIEW,
        target
      )
      expect(alphaAt(ellipse.tiles[0].pixels, 0, 0)).toBe(0)
      expect(alphaAt(ellipse.tiles[0].pixels, 4, 4)).toBe(255)

      const gradient = renderer.renderScene(
        [
          rectangle({
            x: 0,
            y: 0,
            width: 8,
            height: 8,
            fill: {
              type: 'gradient',
              gradientType: 'linear',
              colors: [
                { color: '#FF0000', position: 0 },
                { color: '#0000FF', position: 1 }
              ]
            }
          })
        ],
        VIEW,
        target
      )
      const top = gradient.tiles[0].pixels
      const bottom = (7 * 8) * 4
      expect(top[2]).toBeGreaterThan(200)
      expect(top[bottom]).toBeGreaterThan(200)
      expect(top[bottom]).toBeGreaterThan(top[0])

      const radial = renderer.renderScene(
        [
          rectangle({
            x: 0,
            y: 0,
            width: 8,
            height: 8,
            fill: {
              type: 'gradient',
              gradientType: 'radial',
              colors: [
                { color: '#FF0000', position: 0 },
                { color: '#0000FF', position: 1 }
              ]
            }
          })
        ],
        VIEW,
        target
      )
      expect(radial.tiles[0].pixels[(4 * 8 + 4) * 4]).toBeGreaterThan(200)
      expect(radial.tiles[0].pixels[2]).toBe(255)

      const angular = renderer.renderScene(
        [
          rectangle({
            x: 0,
            y: 0,
            width: 8,
            height: 8,
            fill: {
              type: 'gradient',
              gradientType: 'angular',
              colors: [
                { color: '#00FF00', position: 0 },
                { color: '#0000FF', position: 1 }
              ]
            }
          })
        ],
        VIEW,
        target
      )
      expect(angular.tiles[0].pixels[3]).toBe(255)
      expect(angular.tiles[0].pixels[1]).not.toBe(angular.tiles[0].pixels[(4 * 8) * 4 + 1])
    } finally {
      renderer.dispose()
    }
  })

  test('a clipped parent hides the part of a child that falls outside it', async () => {
    const renderer = await openRenderer()
    if (!renderer) return
    const { target } = sink()
    const parent: GraphNode = {
      id: 'frame',
      type: 'frame',
      parentId: null,
      childIds: ['rect'],
      fields: { x: 0, y: 0, width: 4, height: 4, clip: true },
      passthrough: {}
    }
    const child = rectangle({ x: 2, y: 2, width: 4, height: 4, fill: '#FF0000' }, 'rect', 'frame')
    try {
      const frame = renderer.renderScene([parent, child], VIEW, target)
      const pixels = frame.tiles[0].pixels
      expect(pixels[(2 * 8 + 2) * 4]).toBe(255)
      expect(pixels[(2 * 8 + 5) * 4 + 3]).toBe(0)
    } finally {
      renderer.dispose()
    }
  })

  test('dispose drops the picture and a second renderer still draws', async () => {
    const first = await openRenderer()
    if (!first) return
    const { target } = sink()
    first.renderScene([rectangle({ x: 0, y: 0, width: 2, height: 2, fill: '#FF0000' })], VIEW, target)
    first.dispose()
    first.dispose()
    expect(() => first.renderScene([], VIEW, target)).toThrow(/disposed/)
    const second = await openRenderer()
    if (!second) return
    try {
      const frame = second.renderScene(
        [rectangle({ x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' })],
        VIEW,
        target
      )
      expect(compareRgba(frame.tiles[0].pixels, solidBuffer(8, 8, 2, 2, 4, 3, [255, 0, 0, 255]), 0)).toBe(
        0
      )
    } finally {
      second.dispose()
    }
  })
})

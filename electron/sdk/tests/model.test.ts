import { describe, expect, test } from 'bun:test'

import { selectionChrome } from '../src/canvas/chrome'
import { LAYER_ROW_HEIGHT, LAYER_WINDOW_LIMIT, nextLayerOffset } from '../src/layer-tree/model'

describe('layer window', () => {
  test('keeps each read inside the row cap and advances when the user scrolls', () => {
    expect(LAYER_WINDOW_LIMIT).toBeLessThanOrEqual(200)
    expect(nextLayerOffset(0, 200, 400, { scrollTop: 0, viewportHeight: 0 })).toBeNull()
    expect(
      nextLayerOffset(0, 200, 400, {
        scrollTop: 220 * LAYER_ROW_HEIGHT,
        viewportHeight: 0
      })
    ).toBe(200)
  })
})

describe('selection chrome', () => {
  test('draws a screen-space rectangle from the pointer gesture', () => {
    expect(
      selectionChrome([
        { x: 10, y: 20, type: 'down' },
        { x: 40, y: 50, type: 'move' }
      ])
    ).toEqual({ x: 10, y: 20, width: 30, height: 30 })
    expect(
      selectionChrome([
        { x: 4, y: 4, type: 'down' },
        { x: 4, y: 4, type: 'up' }
      ])
    ).toBeNull()
  })
})

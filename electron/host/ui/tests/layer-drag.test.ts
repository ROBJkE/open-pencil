import { describe, expect, test } from 'bun:test'

import { layerDragStarted, layerDropPosition } from '../shell/layer-drag'

describe('layer drag', () => {
  test('the middle of a container nests and the edges reorder', () => {
    expect(layerDropPosition(0, 24, true)).toBe('before')
    expect(layerDropPosition(5, 24, true)).toBe('before')
    expect(layerDropPosition(12, 24, true)).toBe('into')
    expect(layerDropPosition(19, 24, true)).toBe('after')
  })

  test('the middle of a shape uses the nearer edge', () => {
    expect(layerDropPosition(11, 24, false)).toBe('before')
    expect(layerDropPosition(12, 24, false)).toBe('after')
    expect(layerDropPosition(0, 0, false)).toBe('before')
    expect(layerDropPosition(Number.NaN, 24, true)).toBe('into')
  })

  test('a short pointer movement stays a click', () => {
    expect(layerDragStarted(1, 1)).toBe(false)
    expect(layerDragStarted(4, 0)).toBe(true)
  })
})

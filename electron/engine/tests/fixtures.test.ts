import { describe, expect, test } from 'bun:test'

/**
 * Channel count between two RGBA frames.
 * Later raster tests compare an engine frame with one from the current app.
 * A count above `maxDifferentChannels` fails the comparison.
 */
export function compareRgba(
  actual: Uint8Array,
  expected: Uint8Array,
  maxDifferentChannels: number
): number {
  if (actual.length !== expected.length || actual.length % 4 !== 0) {
    throw new Error(
      `RGBA frames must match and use 4 channels per pixel: ${actual.length} and ${expected.length}`
    )
  }
  let different = 0
  for (const [index, channel] of actual.entries()) {
    if (channel !== expected[index]) different += 1
  }
  if (different > maxDifferentChannels) {
    throw new Error(`${different} RGBA channels differ, limit is ${maxDifferentChannels}`)
  }
  return different
}

describe('raster fixtures', () => {
  test('equal frames differ in no channels', () => {
    const expected = new Uint8Array([0, 0, 0, 255, 8, 8, 8, 255])
    const actual = new Uint8Array(expected)
    expect(compareRgba(actual, expected, 0)).toBe(0)
  })

  test('one changed pixel reports its channels', () => {
    const expected = new Uint8Array([0, 0, 0, 255, 8, 8, 8, 255])
    const actual = new Uint8Array([9, 8, 7, 6, 8, 8, 8, 255])
    expect(compareRgba(actual, expected, 4)).toBe(4)
    expect(() => compareRgba(actual, expected, 0)).toThrow(/4 RGBA channels differ/)
  })
})

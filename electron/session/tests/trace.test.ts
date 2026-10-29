import { describe, expect, test } from 'bun:test'

import { findLongTasks } from '@open-pencil/session'

describe('long tasks', () => {
  test('flags a UI task over 16ms and ignores a frame-sized one', () => {
    const found = findLongTasks([
      { name: 'pan', startMs: 0, durationMs: 8 },
      { name: 'sleep', startMs: 8, durationMs: 17 }
    ])
    expect(found.map((task) => task.name)).toEqual(['sleep'])
  })
})

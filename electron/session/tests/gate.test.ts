import { describe, expect, test } from 'bun:test'

import { assertNoLongTasks } from '#session/trace'

describe('performance gate', () => {
  test("fails the assertion when a task named 'sleep' lasts 20ms", () => {
    expect(() => assertNoLongTasks([{ name: 'sleep', startMs: 0, durationMs: 20 }])).toThrow(
      /sleep 20ms/
    )
  })

  test('passes when every task is at most 16ms', () => {
    expect(() =>
      assertNoLongTasks([
        { name: 'pan', startMs: 0, durationMs: 16 },
        { name: 'scroll', startMs: 16, durationMs: 8 }
      ])
    ).not.toThrow()
  })
})

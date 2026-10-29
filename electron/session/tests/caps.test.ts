import { describe, expect, test } from 'bun:test'

import {
  documentProcessCap,
  JOB_POOL_CAP,
  MAX_LAYER_ROWS,
  PayloadTooLargeError,
  assertPayloadWithinCap
} from '@open-pencil/session'

describe('process caps', () => {
  test('keeps at least two document processes and never more than four', () => {
    expect(documentProcessCap(1)).toBe(2)
    expect(documentProcessCap(3)).toBe(2)
    expect(documentProcessCap(8)).toBe(4)
    expect(JOB_POOL_CAP).toBe(2)
    expect(MAX_LAYER_ROWS).toBe(200)
  })

  test('rejects an oversized IPC payload', () => {
    expect(() => assertPayloadWithinCap({ blob: 'x'.repeat(300_000) })).toThrow(
      PayloadTooLargeError
    )
  })
})

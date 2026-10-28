import { describe, expect, test } from 'bun:test'

import { openReadonlyPreview } from '../examples/readonly'

describe('read-only preview', () => {
  test('refuses a delete command', async () => {
    const preview = await openReadonlyPreview()
    expect(preview.deleteAck.accepted).toBe(false)
    expect(preview.deleteAck.reason).toBe('read-only')
    expect(preview.commands).toEqual([])
  })
})

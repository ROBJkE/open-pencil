import { describe, expect, test } from 'bun:test'

import { createLocalSession, PayloadTooLargeError } from '@open-pencil/session'

import { createFakeEngine } from './helpers/fake-engine'

describe('session client', () => {
  test('refuses mutations on a read-only document and clamps the layer window', async () => {
    const { client } = createLocalSession({ cpuCount: 2, factory: { open: createFakeEngine } })
    const id = await client.openDocument({ name: 'review', readOnly: true })
    const ack = await client.submit(id, { type: 'delete', ids: ['missing'] })
    expect(ack.accepted).toBe(false)
    expect(ack.reason).toBe('read-only')
    const navigation = await client.submit(id, { type: 'set-tool', tool: 'hand' })
    expect(navigation.accepted).toBe(true)
    const window = await client.layerTree(id, { parentId: null, offset: 0, limit: 10_000 })
    expect(window.limit).toBe(200)
  })

  test('rejects an oversized command before it reaches the document', async () => {
    const { client } = createLocalSession({ cpuCount: 2, factory: { open: createFakeEngine } })
    const id = await client.openDocument({ name: 'big' })
    let caught: unknown
    try {
      await client.submit(id, { type: 'edit', id: 'n', fields: { blob: 'x'.repeat(300_000) } })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PayloadTooLargeError)
  })
})

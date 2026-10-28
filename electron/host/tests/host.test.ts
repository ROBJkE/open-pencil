import { describe, expect, test } from 'bun:test'

import { createElectronHost } from '@open-pencil/electron'

describe('electron host', () => {
  test('opens a document through the session client', async () => {
    const host = createElectronHost()
    const id = await host.openDocument({ name: 'Empty', id: 'empty' })
    expect(id).toBe('empty')
    expect(host.kind).toBe('electron')
    const ack = await host.session.client.submit(id, {
      type: 'create',
      parentId: null,
      index: 0,
      node: { id: 'frame', type: 'frame', fields: { name: 'Frame' } }
    })
    expect(ack.accepted).toBe(true)
    const tree = await host.session.client.layerTree(id, { parentId: null, offset: 0, limit: 10 })
    expect(tree.rows.map((row) => row.name)).toEqual(['Frame'])
  })
})

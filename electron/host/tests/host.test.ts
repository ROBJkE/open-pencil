import { describe, expect, test } from 'bun:test'
import * as v from 'valibot'

import { createElectronHost } from '@open-pencil/electron'
import { parseMessage, parseWire } from '#host/wire'

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

  test('reads a document id Electron already decoded', () => {
    const id = 'a0f748be-7249-4d0c-a54b-694b8b69d647'
    expect(parseWire(v.string(), id)).toBeNull()
    expect(parseMessage(v.string(), id)).toBe(id)
  })
})

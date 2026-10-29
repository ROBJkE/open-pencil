import { describe, expect, test } from 'bun:test'

import type { Command } from '@open-pencil/session'

import { createBridgeSession, type OpenPencilBridge } from '../session/bridge'

function bridge(overrides: Partial<OpenPencilBridge> = {}): OpenPencilBridge {
  const base: OpenPencilBridge = {
    openDocument: async () => 'doc-live',
    closeDocument: async () => undefined,
    submit: async () => ({ accepted: true, sequence: 4 }),
    layerTree: async () => ({
      parentId: 'page-1',
      offset: 0,
      limit: 1,
      rows: [],
      total: 2
    }),
    selection: async () => ({ ids: ['rect'], fields: { x: 12 }, mixed: [] }),
    viewport: async () => ({ pageId: 'page-1', zoom: 2, panX: 0, panY: 0, width: 80, height: 40 }),
    activate: async () => undefined,
    subscribe: () => () => undefined,
    onHostEvent: () => () => undefined,
    documentCap: async () => 4,
    spatial: async () => [{ id: 'rect', pageId: 'page-1', x: 1, y: 2, width: 3, height: 4 }],
    openFile: async () => 'doc-opened',
    saveFile: async () => 'doc-live',
    onFrame: () => () => undefined,
    onTile: () => () => undefined,
    replyRestart: () => undefined,
    setMenuState: async () => undefined,
    secrets: {
      read: async () => null,
      write: async () => undefined,
      remove: async () => undefined
    }
  }
  return { ...base, ...overrides }
}

describe('session bridge', () => {
  test('maps preload results into a session client', async () => {
    const client = createBridgeSession(bridge(), 4)
    expect(client.supervisor.documentCap).toBe(4)
    const command: Command = { type: 'undo' }
    await expect(client.submit('doc-live', command)).resolves.toEqual({
      accepted: true,
      sequence: 4
    })
    await expect(client.viewport('doc-live')).resolves.toMatchObject({ pageId: 'page-1', zoom: 2 })
    await expect(client.selection('doc-live')).resolves.toMatchObject({ ids: ['rect'] })
    await expect(
      client.layerTree('doc-live', { parentId: 'page-1', offset: 0, limit: 1 })
    ).resolves.toMatchObject({ parentId: 'page-1', total: 2 })
  })

  test('rejects an open that does not return a document id', async () => {
    const client = createBridgeSession(
      bridge({
        openDocument: async () => null
      }),
      2
    )
    await expect(client.openDocument({ name: 'Untitled' })).rejects.toThrow('open failed')
  })
})

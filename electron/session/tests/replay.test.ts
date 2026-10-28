import { describe, expect, test } from 'bun:test'

import { createReplayClient, type ReplayProjection } from '@open-pencil/session'

function frame(name: string): ReplayProjection {
  return {
    layerTree: {
      parentId: null,
      offset: 0,
      limit: 1,
      total: 1,
      rows: [
        {
          id: name,
          name,
          type: 'frame',
          depth: 0,
          childCount: 0,
          expanded: true,
          selected: false,
          visible: true
        }
      ]
    },
    selection: { ids: [], fields: {}, mixed: [] },
    viewport: { pageId: name, zoom: 1, panX: 0, panY: 0, width: 100, height: 100 }
  }
}

describe('replay client', () => {
  test('serves recorded projections and records commands', async () => {
    const replay = createReplayClient([frame('First'), frame('Second')])
    const id = await replay.client.openDocument({ name: 'tape' })
    expect(
      (await replay.client.layerTree(id, { parentId: null, offset: 0, limit: 10 })).rows[0]?.name
    ).toBe('First')
    replay.showFrame(1)
    expect((await replay.client.viewport(id)).pageId).toBe('Second')
    await replay.client.submit(id, { type: 'set-tool', tool: 'zoom' })
    expect(replay.commands).toEqual([{ type: 'set-tool', tool: 'zoom' }])
  })
})

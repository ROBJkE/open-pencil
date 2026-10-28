import { describe, expect, test } from 'bun:test'

import type { BoundsEntry } from '@open-pencil/session'

import { beginGesture, gestureCommands } from '../shell/gestures'

const entries: BoundsEntry[] = [
  { id: 'frame', pageId: 'page-1', x: 0, y: 0, width: 200, height: 120 },
  { id: 'rect', pageId: 'page-1', x: 10, y: 10, width: 40, height: 30 }
]

const viewport = { zoom: 1, panX: 0, panY: 0, width: 800, height: 600 }

describe('canvas gestures', () => {
  test('a click selects the topmost node on the page', () => {
    const gesture = beginGesture({
      tool: 'select',
      pageId: 'page-1',
      index: 1,
      selection: [],
      entries,
      viewport,
      additive: false,
      id: 'gesture-1',
      screen: { x: 12, y: 12 }
    })
    expect(gestureCommands(gesture, 'commit', { x: 12, y: 12 })).toEqual([
      { type: 'set-selection', ids: ['rect'] }
    ])
  })

  test('a frame drag is chrome until it commits one node', () => {
    const gesture = beginGesture({
      tool: 'frame',
      pageId: 'page-1',
      index: 2,
      selection: [],
      entries,
      viewport,
      additive: false,
      id: 'frame-1',
      screen: { x: 40, y: 50 }
    })
    const dragging = { ...gesture, moved: true }
    expect(gestureCommands(dragging, 'preview', { x: 90, y: 110 })).toEqual([])
    const committed = gestureCommands(dragging, 'commit', { x: 90, y: 110 })
    expect(committed).toEqual([
      {
        type: 'create',
        parentId: 'page-1',
        index: 2,
        node: {
          id: 'frame-1',
          type: 'frame',
          fields: {
            name: 'Frame',
            x: 40,
            y: 50,
            width: 50,
            height: 60,
            fill: '#FFFFFF',
            clip: true
          }
        }
      }
    ])
  })
})

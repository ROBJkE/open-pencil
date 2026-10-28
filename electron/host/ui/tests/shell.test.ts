import { describe, expect, test } from 'bun:test'

import { COPIED_CONTROLS } from '../copied-controls'
import { demoProjection, PAGE_COUNT } from '../session/demo'
import { leadingPageCount } from '../session/pages'
import { scrubSequence } from '../session/scrub'
import { themeAttributes } from '../session/theme'
import { treeQuery, virtualWindow } from '../session/window'
import { closeDocumentTab, documentSlotAvailable, nextDocument } from '../shell/tabs'

describe('copied controls', () => {
  test('records the stateless controls copied into the shell', () => {
    expect([...COPIED_CONTROLS]).toEqual([
      'AppButton',
      'IconButton',
      'Tip',
      'AppInput',
      'AppShortcutText',
      'MenuScrollArea'
    ])
    expect(new Set(COPIED_CONTROLS).size).toBe(COPIED_CONTROLS.length)
  })
})

describe('shell projections', () => {
  test('windows a layer list without reading past the total', () => {
    expect(virtualWindow(0, 240, 100)).toEqual({ offset: 0, limit: 18 })
    expect(virtualWindow(1000, 240, 100).offset).toBe(37)
    expect(virtualWindow(0, 0, 0)).toEqual({ offset: 0, limit: 1 })
  })

  test('pages and layers each start at a zero offset', () => {
    expect(treeQuery('pages', 0, 240, 16, null)).toEqual({
      parentId: null,
      offset: 0,
      limit: 16
    })
    expect(treeQuery('layers', 1000, 240, 400, 'page-1')).toEqual({
      parentId: 'page-1',
      offset: 37,
      limit: 18
    })
  })

  test('counts leading pages in the replay tape', async () => {
    const rows = demoProjection().layerTree.rows
    const count = await leadingPageCount(async (offset) => rows[offset], rows.length)
    expect(count).toBe(PAGE_COUNT)
  })

  test('a scrub is previews followed by one commit', () => {
    expect(scrubSequence(['layer-4'], 'x', [33, 34])).toEqual([
      { type: 'preview', edits: [{ id: 'layer-4', fields: { x: 33 } }] },
      { type: 'preview', edits: [{ id: 'layer-4', fields: { x: 34 } }] },
      { type: 'commit-preview' }
    ])
  })

  test('theme class names match the copied token selectors', () => {
    expect(themeAttributes('light')).toEqual({ className: 'light', theme: 'light' })
    expect(themeAttributes('dark')).toEqual({ className: 'dark', theme: 'dark' })
  })

  test('keeps one document tab open', () => {
    const tabs = [
      { id: 'doc-untitled', name: 'Untitled' },
      { id: 'doc-components', name: 'Components' }
    ]
    expect(closeDocumentTab(tabs, 'doc-untitled', 'doc-untitled')).toEqual({
      tabs: [{ id: 'doc-components', name: 'Components' }],
      activeId: 'doc-components'
    })
    expect(closeDocumentTab(tabs.slice(0, 1), 'doc-untitled', 'doc-untitled')).toBeNull()
    expect(nextDocument(2).tab).toEqual({ id: 'doc-3', name: 'Untitled 3' })
    expect(documentSlotAvailable(2, 0, 2)).toBe(false)
    expect(documentSlotAvailable(1, 0, 2)).toBe(true)
    expect(documentSlotAvailable(1, 1, 2)).toBe(false)
  })
})

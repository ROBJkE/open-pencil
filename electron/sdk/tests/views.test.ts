import { describe, expect, test } from 'bun:test'

import { h } from 'vue'

import {
  createReplayClient,
  type LayerRow,
  type ReplayProjection,
  type SessionClient
} from '@open-pencil/session'

import { openReadonlyPreview } from '../examples/readonly'
import { LAYER_ROW_HEIGHT } from '../src/layer-tree/model'
import { flushView, mountSessionComponent } from './mount'

interface ScrollTarget {
  scrollTop: number
  dispatchEvent(event: Event): void
}

interface FieldTarget {
  value: string
  dispatchEvent(event: Event): void
}

interface ChromeTarget {
  style: { left: string; top: string; width: string; height: string }
}

function isScrollTarget(node: object | null): node is ScrollTarget {
  if (!node) return false
  return (
    'scrollTop' in node &&
    typeof node.scrollTop === 'number' &&
    'dispatchEvent' in node &&
    typeof node.dispatchEvent === 'function'
  )
}

function isField(node: object | null): node is FieldTarget {
  if (!node || !('value' in node) || typeof node.value !== 'string') return false
  return 'dispatchEvent' in node && typeof node.dispatchEvent === 'function'
}

function isChrome(node: object | null): node is ChromeTarget {
  if (!node || !('style' in node)) return false
  const { style } = node
  return typeof style === 'object' && style !== null && 'left' in style && 'top' in style
}

const layerTreeFile = new URL('../src/layer-tree/LayerTree.vue', import.meta.url).pathname
const pageListFile = new URL('../src/page-list/PageList.vue', import.meta.url).pathname
const propertiesFile = new URL('../src/properties/Properties.vue', import.meta.url).pathname
const canvasFile = new URL('../src/canvas/CanvasFrame.vue', import.meta.url).pathname

function row(index: number): LayerRow {
  return {
    id: `row-${index}`,
    name: `Row-${String(index).padStart(3, '0')}`,
    type: 'rectangle',
    depth: 0,
    childCount: 0,
    expanded: false,
    selected: false,
    visible: true
  }
}

function projection(
  rows: LayerRow[],
  fields: ReplayProjection['selection']['fields'] = {}
): ReplayProjection {
  return {
    layerTree: {
      parentId: null,
      offset: 0,
      limit: rows.length,
      total: rows.length,
      rows
    },
    selection: { ids: ['rect'], fields, mixed: [] },
    viewport: { pageId: null, zoom: 1, panX: 0, panY: 0, width: 800, height: 600 }
  }
}

async function openReplay(frame: ReplayProjection) {
  const replay = createReplayClient([frame])
  const documentId = await replay.client.openDocument({ name: 'Replay' })
  return { client: replay.client, documentId, commands: replay.commands }
}

describe('document views', () => {
  test('renders recorded layer names from a replay', async () => {
    const preview = await openReadonlyPreview()
    const mounted = await mountSessionComponent(layerTreeFile, preview.client, {
      documentId: preview.documentId
    })
    expect(mounted.element.textContent).toContain('Header')
    expect(mounted.element.textContent).toContain('Title')
    mounted.unmount()
  })

  test('page list shows root rows only', async () => {
    const preview = await openReadonlyPreview()
    const mounted = await mountSessionComponent(pageListFile, preview.client, {
      documentId: preview.documentId
    })
    expect(mounted.element.textContent).toContain('Header')
    expect(mounted.element.textContent).not.toContain('Title')
    mounted.unmount()
  })

  test('asks for another layer window when the user scrolls', async () => {
    const rows = Array.from({ length: 250 }, (_item, index) => row(index))
    const replay = createReplayClient([projection(rows)])
    const queries: number[] = []
    const documentId = await replay.client.openDocument({ name: 'Long' })
    const client: SessionClient = {
      ...replay.client,
      layerTree(id, query) {
        queries.push(query.limit)
        return replay.client.layerTree(id, query)
      }
    }
    const mounted = await mountSessionComponent(layerTreeFile, client, { documentId })
    expect(mounted.element.textContent).toContain('Row-000')
    expect(mounted.element.textContent).not.toContain('Row-220')
    const scroller = mounted.element.querySelector('[data-slot="layer-tree"]')
    if (!isScrollTarget(scroller)) throw new Error('layer tree did not render')
    scroller.scrollTop = 220 * LAYER_ROW_HEIGHT
    scroller.dispatchEvent(new Event('scroll'))
    await flushView()
    expect(queries.every((limit) => limit <= 200)).toBe(true)
    expect(queries.some((limit) => limit > 0)).toBe(true)
    expect(mounted.element.textContent).toContain('Row-220')
    mounted.unmount()
  })

  test('edits a field and commits a scrub through the session', async () => {
    const opened = await openReplay(projection([row(0)], { x: 4, name: 'Rectangle' }))
    const mounted = await mountSessionComponent(propertiesFile, opened.client, {
      documentId: opened.documentId
    })
    const input = mounted.element.querySelector('[data-kind="number"]')
    if (!isField(input)) throw new Error('number field did not render')
    input.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, bubbles: true }))
    input.dispatchEvent(new PointerEvent('pointermove', { clientX: 6, bubbles: true }))
    input.dispatchEvent(new PointerEvent('pointerup', { clientX: 6, bubbles: true }))
    await flushView()
    expect(opened.commands).toEqual([
      { type: 'preview', edits: [{ id: 'rect', fields: { x: 10 } }] },
      { type: 'commit-preview' }
    ])
    const name = mounted.element.querySelector('[data-kind="text"]')
    if (!isField(name)) throw new Error('text field did not render')
    name.value = 'Title'
    name.dispatchEvent(new Event('change', { bubbles: true }))
    await flushView()
    expect(opened.commands).toEqual([
      { type: 'preview', edits: [{ id: 'rect', fields: { x: 10 } }] },
      { type: 'commit-preview' },
      { type: 'edit', id: 'rect', fields: { name: 'Title' } }
    ])
    mounted.unmount()
  })

  test('places tile slot content and screen-space selection chrome', async () => {
    const preview = await openReadonlyPreview()
    const mounted = await mountSessionComponent(
      canvasFile,
      preview.client,
      {
        pointerEvents: [
          { x: 10, y: 20, type: 'down' },
          { x: 40, y: 50, type: 'move' }
        ]
      },
      {
        tiles: () => h('span', { 'data-slot': 'tile' }, 'tile-a')
      }
    )
    expect(mounted.element.textContent).toContain('tile-a')
    expect(mounted.element.querySelector('canvas')).toBeNull()
    const chrome = mounted.element.querySelector('[data-slot="selection-chrome"]')
    if (!isChrome(chrome)) throw new Error('selection chrome did not render')
    expect(chrome.style.left).toBe('10px')
    expect(chrome.style.top).toBe('20px')
    expect(chrome.style.width).toBe('30px')
    expect(chrome.style.height).toBe('30px')
    mounted.unmount()
  })
})

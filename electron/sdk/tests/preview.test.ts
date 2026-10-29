import { describe, expect, test } from 'bun:test'

import { h, reactive } from 'vue'

import type { JSONValue } from '@open-pencil/session'

import {
  PREVIEW_KINDS,
  previewIslands,
  type PreviewIsland,
  type PreviewKind,
  type PreviewNode,
  type PreviewViewport
} from '../src/preview/model'
import { domDocument, domWindow } from './dom'
import { loadVueFile } from './load-vue'
import { flushView } from './mount'
import { domRenderer } from './renderer'

const previewFile = new URL('../src/preview/PreviewLayer.vue', import.meta.url).pathname

const VIEWPORT: PreviewViewport = { zoom: 1, panX: 0, panY: 0, width: 800, height: 600 }

const KIND_LIST: readonly PreviewKind[] = [
  'button',
  'textField',
  'textarea',
  'numberField',
  'toggle',
  'switch',
  'checkbox',
  'radio',
  'radioGroup',
  'toggleGroup',
  'slider',
  'progress',
  'tabs',
  'collapsible',
  'accordion'
]

interface NativeControl {
  tag: string
  type: string | null
  role: string | null
}

const NATIVE: Record<PreviewKind, NativeControl> = {
  button: { tag: 'BUTTON', type: 'button', role: null },
  textField: { tag: 'INPUT', type: 'text', role: null },
  textarea: { tag: 'TEXTAREA', type: null, role: null },
  numberField: { tag: 'INPUT', type: 'number', role: null },
  toggle: { tag: 'BUTTON', type: 'button', role: null },
  switch: { tag: 'INPUT', type: 'checkbox', role: 'switch' },
  checkbox: { tag: 'INPUT', type: 'checkbox', role: null },
  radio: { tag: 'INPUT', type: 'radio', role: null },
  radioGroup: { tag: 'INPUT', type: 'radio', role: null },
  toggleGroup: { tag: 'BUTTON', type: 'button', role: null },
  slider: { tag: 'INPUT', type: 'range', role: null },
  progress: { tag: 'PROGRESS', type: null, role: null },
  tabs: { tag: 'BUTTON', type: 'button', role: 'tab' },
  collapsible: { tag: 'BUTTON', type: 'button', role: null },
  accordion: { tag: 'BUTTON', type: 'button', role: null }
}

function controlNode(id: string, type: string, fields: Record<string, JSONValue>): PreviewNode {
  return { id, type, fields }
}

function placed(id: string, type: string, behaviour: JSONValue | null, x: number): PreviewNode {
  const fields: Record<string, JSONValue> = { x, y: 12, width: 40, height: 16 }
  if (behaviour !== null) fields.behaviour = behaviour
  return controlNode(id, type, fields)
}

interface CancelableEvent {
  defaultPrevented: boolean
}

interface StyledTarget {
  tagName: string
  style: { left: string; top: string; width: string; height: string; pointerEvents: string }
  getAttribute(name: string): string | null
  querySelector(selector: string): Element | null
  dispatchEvent(event: CancelableEvent): boolean
}

function isStyled(node: unknown): node is StyledTarget {
  if (typeof node !== 'object' || node === null) return false
  if (!('style' in node) || !('tagName' in node) || typeof node.tagName !== 'string') return false
  if (!('getAttribute' in node) || typeof node.getAttribute !== 'function') return false
  const { style } = node
  return typeof style === 'object' && style !== null && 'pointerEvents' in style && 'left' in style
}

function isField(node: unknown): node is HTMLInputElement {
  if (typeof node !== 'object' || node === null || !('value' in node)) return false
  if (typeof node.value !== 'string') return false
  return 'dispatchEvent' in node && typeof node.dispatchEvent === 'function'
}

interface QueryRoot {
  querySelector(selector: string): unknown
}

interface PreviewHandle {
  element: QueryRoot
  setIslands(islands: readonly PreviewIsland[]): Promise<void>
  unmount(): void
}

async function mountPreview(islands: readonly PreviewIsland[]): Promise<PreviewHandle> {
  const component = await loadVueFile(previewFile)
  const state = reactive({ islands: [...islands] })
  const host = domDocument.createElement('div')
  domDocument.body.append(host)
  const app = domRenderer.createApp({
    name: 'PreviewHost',
    setup() {
      return () => h(component, { islands: state.islands })
    }
  })
  app.mount(host)
  await flushView()
  return {
    element: host,
    async setIslands(next) {
      state.islands = [...next]
      await flushView()
    },
    unmount() {
      app.unmount()
      host.remove()
    }
  }
}

function islandBox(root: QueryRoot, id: string): StyledTarget {
  const found = root.querySelector(`[data-island="${id}"]`)
  if (!isStyled(found)) throw new Error(`island ${id} did not render`)
  return found
}

function nativeControl(box: StyledTarget): StyledTarget {
  const found = box.querySelector('[data-slot="preview-control"]')
  if (!isStyled(found)) throw new Error('preview control did not render')
  return found
}

function wheelEvent(): CancelableEvent {
  return new domWindow.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 8 })
}

describe('preview islands', () => {
  test('keeps the shipped behaviour inventory', () => {
    expect(Array.from(PREVIEW_KINDS)).toEqual(Array.from(KIND_LIST))
  })

  test('a behaviour field or a kind type on screen becomes an island', () => {
    const nodes = [
      placed('labeled', 'frame', 'button', 10),
      placed('typed', 'slider', null, 80),
      placed('stored', 'rectangle', { kind: 'switch' }, 160),
      placed('plain', 'rectangle', null, 240),
      placed('unknown', 'button', 'not-a-control', 320)
    ]
    const surface = previewIslands(nodes, VIEWPORT)
    expect(surface.pointerEvents).toBe('none')
    expect(surface.controlPointerEvents).toBe('auto')
    expect(surface.captureWheel).toBe(false)
    expect(surface.islands).toEqual([
      { id: 'labeled', kind: 'button', rect: { x: 10, y: 12, width: 40, height: 16 } },
      { id: 'typed', kind: 'slider', rect: { x: 80, y: 12, width: 40, height: 16 } },
      { id: 'stored', kind: 'switch', rect: { x: 160, y: 12, width: 40, height: 16 } }
    ])
  })

  test('drops a node outside the viewport and follows pan and zoom', () => {
    const nodes = [
      placed('edge', 'checkbox', null, 790),
      placed('past', 'checkbox', null, 800),
      placed('left', 'checkbox', null, -40),
      placed('overlap', 'button', 'button', -10)
    ]
    expect(previewIslands(nodes, VIEWPORT).islands.map((island) => island.id)).toEqual([
      'edge',
      'overlap'
    ])
    const shifted = [placed('home', 'button', null, 10), placed('away', 'button', null, 900)]
    expect(previewIslands(shifted, VIEWPORT).islands.map((island) => island.id)).toEqual(['home'])
    expect(
      previewIslands(shifted, { ...VIEWPORT, panX: -200 }).islands.map((island) => island.id)
    ).toEqual(['away'])
    const frame = { zoom: 2, panX: 4, panY: -8, width: 400, height: 300 }
    expect(previewIslands([placed('near', 'tabs', null, 10)], frame).islands).toEqual([
      { id: 'near', kind: 'tabs', rect: { x: 24, y: 16, width: 80, height: 32 } }
    ])
    expect(previewIslands([placed('far', 'tabs', null, 300)], frame).islands).toEqual([])
  })

  test('preview input does not edit the document and the model has no command', async () => {
    const nodes = [
      placed('name', 'textField', null, 4),
      placed('on', 'toggle', null, 64),
      placed('amount', 'slider', null, 124),
      placed('flag', 'checkbox', null, 184)
    ]
    const before = structuredClone(nodes)
    const surface = previewIslands(nodes, VIEWPORT)
    expect(Object.keys(surface).sort()).toEqual([
      'captureWheel',
      'controlPointerEvents',
      'islands',
      'pointerEvents'
    ])
    expect(surface.islands.every((island) => !Object.hasOwn(island, 'command'))).toBe(true)
    const mounted = await mountPreview(surface.islands)
    const name = nativeControl(islandBox(mounted.element, 'name'))
    if (!isField(name)) throw new Error('text field did not render')
    name.value = 'Hello'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    name.dispatchEvent(new Event('change', { bubbles: true }))
    const toggle = nativeControl(islandBox(mounted.element, 'on'))
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const amount = nativeControl(islandBox(mounted.element, 'amount'))
    if (!isField(amount)) throw new Error('slider did not render')
    amount.value = '20'
    amount.dispatchEvent(new Event('input', { bubbles: true }))
    const flag = nativeControl(islandBox(mounted.element, 'flag'))
    flag.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushView()
    expect(nodes).toEqual(before)
    expect(previewIslands(nodes, VIEWPORT).islands).toEqual(surface.islands)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    mounted.unmount()
  })
})

describe('preview layer', () => {
  test('positions each kind from the rect and leaves wheel to the canvas', async () => {
    const nodes = KIND_LIST.map((kind, index) => placed(kind, 'frame', kind, 8 + index * 20))
    const surface = previewIslands(nodes, VIEWPORT)
    expect(surface.islands).toHaveLength(KIND_LIST.length)
    const mounted = await mountPreview(surface.islands)
    const layer = mounted.element.querySelector('[data-slot="preview-layer"]')
    if (!isStyled(layer)) throw new Error('preview layer did not render')
    expect(layer.style.pointerEvents).toBe(surface.pointerEvents)
    expect(layer.getAttribute('data-capture-wheel')).toBe('false')
    const wheel = wheelEvent()
    layer.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(false)
    for (const island of surface.islands) {
      const box = islandBox(mounted.element, island.id)
      expect(box.style.pointerEvents).toBe(surface.controlPointerEvents)
      expect(box.style.left).toBe(`${island.rect.x}px`)
      expect(box.style.top).toBe(`${island.rect.y}px`)
      expect(box.style.width).toBe(`${island.rect.width}px`)
      expect(box.style.height).toBe(`${island.rect.height}px`)
      const control = nativeControl(box)
      const expected = NATIVE[island.kind]
      expect(control.tagName).toBe(expected.tag)
      expect(control.getAttribute('type')).toBe(expected.type)
      expect(control.getAttribute('role')).toBe(expected.role)
      expect(control.style.pointerEvents).toBe(surface.controlPointerEvents)
      const overControl = wheelEvent()
      control.dispatchEvent(overControl)
      expect(overControl.defaultPrevented).toBe(false)
    }
    const name = nativeControl(islandBox(mounted.element, 'textField'))
    if (!isField(name)) throw new Error('text field did not render')
    name.value = 'kept'
    const moved = surface.islands.map((island) => ({
      ...island,
      rect: {
        x: island.rect.x + 15,
        y: island.rect.y + 6,
        width: island.rect.width * 2,
        height: island.rect.height
      }
    }))
    await mounted.setIslands(moved)
    const shifted = islandBox(mounted.element, 'textField')
    const textIsland = moved.find((island) => island.id === 'textField')
    if (!textIsland) throw new Error('text field island missing')
    expect(shifted.style.left).toBe(`${textIsland.rect.x}px`)
    expect(shifted.style.top).toBe(`${textIsland.rect.y}px`)
    expect(shifted.style.width).toBe(`${textIsland.rect.width}px`)
    const kept = nativeControl(shifted)
    if (!isField(kept)) throw new Error('text field was recreated without its value')
    expect(kept.value).toBe('kept')
    mounted.unmount()
  })
})

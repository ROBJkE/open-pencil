import { describe, expect, test } from 'bun:test'

import {
  createJobQueue,
  exportDesignTokens,
  exportJSX,
  exportJob,
  exportPNG,
  exportSVG,
  htmlImportRequest,
  importDesignTokens,
  importSVG,
  QUEUED_EXPORT_KINDS
} from '#engine/io/index'
import { createSceneRenderer } from '#engine/render/index'

import { createDocumentEngine } from '@open-pencil/engine'
import type { Command, GraphNode, JSONValue } from '@open-pencil/session'

import { compareRgba } from './fixtures.test'

const VIEW = { zoom: 1, panX: 0, panY: 0, width: 8, height: 8 }

function layer(id: string, type: string, fields: Record<string, JSONValue>): GraphNode {
  return { id, type, parentId: null, childIds: [], fields, passthrough: {} }
}

function solidBuffer(
  width: number,
  height: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  channels: readonly [number, number, number, number]
): Uint8Array {
  const buffer = new Uint8Array(width * height * 4)
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      const offset = (row * width + column) * 4
      buffer[offset] = channels[0]
      buffer[offset + 1] = channels[1]
      buffer[offset + 2] = channels[2]
      buffer[offset + 3] = channels[3]
    }
  }
  return buffer
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function applyAll(commands: readonly Command[]) {
  const document = createDocumentEngine({ name: 'import', id: 'import' })
  for (const command of commands) {
    const result = document.apply(command)
    expect(result.ack.accepted).toBe(true)
  }
  return document
}

describe('job queue', () => {
  test('runs one job at a time', async () => {
    const queue = createJobQueue()
    const order: string[] = []
    let active = 0
    let maxActive = 0
    const track = (label: string) =>
      queue.enqueue(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        order.push(`${label}-start`)
        await delay(20)
        order.push(`${label}-end`)
        active -= 1
      })
    const first = track('a')
    const second = track('b')
    await first
    await second
    expect(maxActive).toBe(1)
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
  })

  test('yields between jobs so a timer can run', async () => {
    const queue = createJobQueue()
    const order: string[] = []
    let yielded = false
    const first = queue.enqueue(() => {
      order.push('job-1')
    })
    const second = queue.enqueue(() => {
      order.push('job-2')
      return yielded
    })
    setTimeout(() => {
      yielded = true
      order.push('macrotask')
    }, 0)
    await first
    expect(await second).toBe(true)
    expect(order).toEqual(['job-1', 'macrotask', 'job-2'])
  })

  test('a failed job does not block the next one', async () => {
    const queue = createJobQueue()
    const first = queue.enqueue(() => {
      throw new Error('boom')
    })
    const second = queue.enqueue(() => 'ok')
    let reason = ''
    try {
      await first
    } catch (error: unknown) {
      reason = error instanceof Error ? error.message : ''
    }
    expect(reason).toBe('boom')
    expect(await second).toBe('ok')
  })
})

describe('svg', () => {
  const rect = layer('rect', 'rectangle', { x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' })
  const ellipse = layer('ball', 'ellipse', { x: 0, y: 0, width: 8, height: 8, fill: '#00FF00' })
  const text = layer('label', 'text', {
    x: 1,
    y: 2,
    width: 40,
    height: 20,
    content: 'A & B <C>',
    fontSize: 16,
    fontFamily: 'Inter',
    fill: '#111111'
  })

  test('exports a rectangle and imports it as a create command', () => {
    const svg = exportSVG([rect])
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2 4 3" width="4" height="3"><rect id="rect" x="2" y="2" width="4" height="3" fill="#FF0000" /></svg>'
    )
    expect(importSVG(svg)).toEqual([
      {
        type: 'create',
        parentId: null,
        index: 0,
        node: {
          id: 'rect',
          type: 'rectangle',
          fields: { x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' }
        }
      }
    ])
  })

  test('rectangle, ellipse, and text round-trip through create commands', () => {
    const commands = importSVG(exportSVG([rect, ellipse, text]))
    const document = applyAll(commands)
    expect(document.getNode('rect')?.fields).toEqual(rect.fields)
    expect(document.getNode('ball')?.fields).toEqual(ellipse.fields)
    expect(document.getNode('label')?.fields).toEqual(text.fields)
    expect(document.checkpoint().rootIds).toEqual(['rect', 'ball', 'label'])
  })

  test('a grouped rect without an id becomes a root rectangle', () => {
    const commands = importSVG(
      '<svg xmlns="http://www.w3.org/2000/svg"><g><rect x="1" y="2" width="3" height="4" fill="#FF0000"/></g></svg>'
    )
    expect(commands).toEqual([
      {
        type: 'create',
        parentId: null,
        index: 0,
        node: {
          type: 'rectangle',
          fields: { x: 1, y: 2, width: 3, height: 4, fill: '#FF0000' }
        }
      }
    ])
    const document = applyAll(commands)
    const id = document.checkpoint().rootIds[0]
    expect(id).toBeDefined()
    if (!id) return
    expect(document.getNode(id)?.type).toBe('rectangle')
    expect(document.getNode(id)?.fields).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      fill: '#FF0000'
    })
  })

  test('an empty scene exports an empty svg', () => {
    expect(exportSVG([layer('frame', 'frame', { x: 0, y: 0, width: 10, height: 10 })])).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0" width="0" height="0"></svg>'
    )
    expect(importSVG('<svg></svg>')).toEqual([])
  })
})

describe('jsx', () => {
  test('returns a function whose element carries a style object', () => {
    const jsx = exportJSX([
      layer('rect', 'rectangle', { x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' })
    ])
    expect(jsx).toBe(
      'export function Design() {\n  return (\n    <div data-kind="rectangle" style={{ position: "absolute", left: 2, top: 2, width: 4, height: 3, background: "#FF0000" }} />\n  )\n}\n'
    )
  })

  test('ellipse and text keep geometry in style', () => {
    const jsx = exportJSX([
      layer('ball', 'ellipse', { x: 0, y: 0, width: 8, height: 8, fill: '#00FF00' }),
      layer('label', 'text', {
        x: 1,
        y: 2,
        content: 'Hello',
        fontSize: 16,
        fontFamily: 'Inter',
        fill: '#111111'
      })
    ])
    expect(jsx.startsWith('export function Design()')).toBe(true)
    expect(jsx).toContain(
      'style={{ position: "absolute", left: 0, top: 0, width: 8, height: 8, borderRadius: "50%", background: "#00FF00" }}'
    )
    expect(jsx).toContain(
      'style={{ position: "absolute", left: 1, top: 2, fontSize: 16, fontFamily: "Inter", color: "#111111" }}'
    )
    expect(jsx).toContain('>Hello</p>')
  })
})

describe('png', () => {
  const rect = layer('rect', 'rectangle', { x: 2, y: 2, width: 4, height: 3, fill: '#FF0000' })
  const expected = solidBuffer(8, 8, 2, 2, 4, 3, [255, 0, 0, 255])

  test('matches the renderer tile bytes for a solid rectangle', async () => {
    let usedRenderer = false
    const rendered = await exportPNG([rect], VIEW, {
      loadRenderer: async () => {
        usedRenderer = true
        return createSceneRenderer()
      }
    })
    expect(usedRenderer).toBe(true)
    expect(rendered).toMatchObject({ encoding: 'rgba', width: 8, height: 8 })
    expect(compareRgba(rendered.bytes, expected, 0)).toBe(0)
  })

  test('uses the same tile bytes when CanvasKit does not load', async () => {
    const failed = await exportPNG([rect], VIEW, {
      loadRenderer: () => Promise.reject(new Error('CanvasKit did not start'))
    })
    expect(failed).toMatchObject({ encoding: 'rgba', width: 8, height: 8 })
    expect(compareRgba(failed.bytes, expected, 0)).toBe(0)
  })
})

describe('design tokens', () => {
  test('round-trips the variable bag through set-variable commands', () => {
    const source = createDocumentEngine({ name: 'tokens', id: 'tokens' })
    source.apply({ type: 'set-variable', name: 'gap', value: 8 })
    source.apply({
      type: 'set-variable',
      name: 'accent',
      value: '#111111',
      theme: { mode: 'dark' }
    })
    source.apply({ type: 'set-variable', name: 'visible', value: true })
    source.apply({ type: 'set-variable', name: 'font', value: 'Inter' })

    const file = exportDesignTokens(source.bag('variables'))
    expect(file).toEqual({
      gap: { $type: 'number', $value: 8 },
      accent: {
        $type: 'color',
        $value: '#111111',
        $extensions: { 'dev.openpencil': { theme: { mode: 'dark' } } }
      },
      visible: { $type: 'boolean', $value: true },
      font: { $type: 'string', $value: 'Inter' }
    })

    const restored = applyAll(importDesignTokens(JSON.stringify(file)))
    expect(restored.bag('variables')).toEqual(source.bag('variables'))
  })

  test('keeps an explicit type and reads a grouped token', () => {
    const file = exportDesignTokens({ accent: { type: 'string', value: '#111111' } })
    expect(file.accent).toEqual({ $type: 'string', $value: '#111111' })
    expect(
      importDesignTokens(
        JSON.stringify({ color: { accent: { $type: 'color', $value: '#111111' } } })
      )
    ).toEqual([{ type: 'set-variable', name: 'color.accent', value: '#111111' }])
  })

  test('rejects text that is not a token object', () => {
    expect(() => importDesignTokens('not json')).toThrow(/DTCG/)
    expect(() => importDesignTokens('[]')).toThrow(/DTCG/)
    expect(() => importDesignTokens('"gap"')).toThrow(/DTCG/)
  })
})

describe('queued exports', () => {
  test('names each unfinished format and leaves it queued', () => {
    expect(QUEUED_EXPORT_KINDS).toEqual([
      'pdf',
      'pptx',
      'html',
      'tailwind',
      'storybook',
      'mermaid',
      'draw.io'
    ])
    for (const kind of QUEUED_EXPORT_KINDS) {
      expect(exportJob(kind)).toEqual({ status: 'queued', kind })
    }
  })
})

describe('html import', () => {
  test('describes a hidden sandbox and does not open a page', () => {
    expect(htmlImportRequest('<main>Hello</main>')).toEqual({
      kind: 'html-import',
      hidden: true,
      javascript: false,
      network: false,
      nodeIntegration: false,
      html: '<main>Hello</main>'
    })
  })
})

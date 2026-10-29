import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  applyTextEdit,
  fallbackTextSize,
  measureText,
  missingFont,
  type TextMeasure
} from '#engine/text'

import { createDocumentEngine, type DocumentStore } from '@open-pencil/engine'
import type { FontCatalog, FontFace, GraphNode } from '@open-pencil/session'

function workspaceRoot(from = dirname(fileURLToPath(import.meta.url))): string {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'bun.lock'))) return dir
    if (dirname(dir) === dir) throw new Error(`No workspace root above ${from}`)
  }
}

const interFace: FontFace = {
  family: 'Inter',
  style: 'SemiBold',
  weight: 600,
  path: join(workspaceRoot(), 'packages/core/assets/Inter-SemiBold.ttf')
}

function textNode(id: string, fields: GraphNode['fields']): GraphNode {
  return { id, type: 'text', parentId: null, childIds: [], fields, passthrough: {} }
}

function addText(document: DocumentStore, id: string, content: string, fontSize = 12): void {
  const created = document.apply({
    type: 'create',
    parentId: null,
    index: 0,
    node: {
      id,
      type: 'text',
      fields: {
        content,
        fontSize,
        fontFamily: 'Inter',
        textGrowth: 'auto',
        width: 4,
        height: 4
      }
    }
  })
  expect(created.ack.accepted).toBe(true)
}

describe('fallback text size', () => {
  test('width is font size times content length times 0.5, height is font size times line count', () => {
    const content = 'Hi\nYo'
    const fontSize = 10
    const node = textNode('t', { content, fontSize })
    expect(content.length).toBe(5)
    expect(content.split('\n').length).toBe(2)
    expect(fallbackTextSize(node)).toEqual({
      width: fontSize * content.length * 0.5,
      height: fontSize * content.split('\n').length
    })
  })

  test('an empty string is one line and has no width', () => {
    expect(fallbackTextSize(textNode('t', { content: '', fontSize: 8 }))).toEqual({
      width: 0,
      height: 8
    })
  })

  test('an omitted font size is 14', () => {
    expect(fallbackTextSize(textNode('t', { content: 'A' }))).toEqual({ width: 7, height: 14 })
  })

  test('a numeric font size string is the size', () => {
    expect(fallbackTextSize(textNode('t', { content: 'AB', fontSize: '10' }))).toEqual({
      width: 10,
      height: 10
    })
  })
})

describe('measureText', () => {
  test('a missing font file uses the fallback size', async () => {
    const content = 'Hello'
    const fontSize = 16
    const node = textNode('t', { content, fontSize, fontFamily: 'Inter' })
    const font: FontFace = {
      family: 'Inter',
      style: 'Regular',
      weight: 400,
      path: join(workspaceRoot(), 'packages/core/assets/missing-font.ttf')
    }
    const measured = await measureText(node, font)
    expect(measured.path).toBe('fallback')
    expect(measured.width).toBe(fontSize * content.length * 0.5)
    expect(measured.height).toBe(fontSize)
  })

  test('a loaded face is measured with CanvasKit paragraph', async () => {
    expect(existsSync(interFace.path)).toBe(true)
    const content = 'Hello'
    const fontSize = 16
    const node = textNode('t', {
      content,
      fontSize,
      fontFamily: 'Inter',
      fontWeight: 600,
      textGrowth: 'auto'
    })
    const measured = await measureText(node, interFace)
    const fallback = fallbackTextSize(node)
    expect(measured.path).toBe('paragraph')
    expect(measured.width).toBeGreaterThan(0)
    expect(measured.height).toBeGreaterThan(0)
    expect(measured.width).not.toBe(fallback.width)
    expect(measured.height).not.toBe(fallback.height)
  })

  test('fixed-width text wraps in the paragraph', async () => {
    const content = 'Hello Hello Hello'
    const fields = { content, fontSize: 16, fontFamily: 'Inter', fontWeight: 600 }
    const wide = await measureText(textNode('wide', { ...fields, textGrowth: 'auto' }), interFace)
    const narrow = await measureText(
      textNode('narrow', { ...fields, textGrowth: 'fixed-width', width: 40 }),
      interFace
    )
    expect(wide.path).toBe('paragraph')
    expect(narrow.path).toBe('paragraph')
    expect(narrow.height).toBeGreaterThan(wide.height)
    expect(narrow.width).toBeLessThanOrEqual(40)
  })

  test('empty text measured with a face has no width', async () => {
    const measured = await measureText(
      textNode('t', { content: '', fontSize: 16, fontFamily: 'Inter' }),
      interFace
    )
    expect(measured.path).toBe('paragraph')
    expect(measured.width).toBe(0)
    expect(measured.height).toBeGreaterThan(0)
  })
})

describe('missingFont', () => {
  const catalog: FontCatalog = {
    faces: [
      { family: 'Inter', style: 'Regular', weight: 400, path: '/fonts/Inter-Regular.ttf' },
      { family: 'Inter', style: 'Bold', weight: 700, path: '/fonts/Inter-Bold.ttf' }
    ]
  }

  test('a family in the catalog is present, including another weight of that family', () => {
    expect(missingFont(textNode('a', { fontFamily: 'Inter' }), catalog)).toBeNull()
    expect(missingFont(textNode('b', { fontFamily: 'Inter', fontWeight: 900 }), catalog)).toBeNull()
    expect(missingFont(textNode('c', { fontFamily: ' Inter ' }), catalog)).toBeNull()
  })

  test('a family that is not in the catalog is reported', () => {
    expect(missingFont(textNode('c', { fontFamily: 'Missing' }), catalog)).toEqual({
      nodeId: 'c',
      family: 'Missing'
    })
  })

  test('text with no family uses Inter', () => {
    expect(missingFont(textNode('d', {}), catalog)).toBeNull()
    expect(missingFont(textNode('e', {}), { faces: [] })).toEqual({
      nodeId: 'e',
      family: 'Inter'
    })
  })
})

describe('applyTextEdit', () => {
  test('editing one text node measures that node and commits one undo step', async () => {
    const document = createDocumentEngine({ name: 'text', id: 'text-edit' })
    addText(document, 'edited', 'b', 12)
    addText(document, 'other-0', 'xxxxxxxxxx', 40)
    addText(document, 'other-1', 'yyyyyyyyyy', 40)
    addText(document, 'other-2', 'zzzzzzzzzz', 40)
    addText(document, 'other-3', 'wwwwwwwwww', 40)
    expect(document.nodes.size).toBe(5)

    const measured: string[] = []
    const measure: TextMeasure = async (node) => {
      measured.push(node.id)
      const size = fallbackTextSize(node)
      return { width: size.width, height: size.height, path: 'fallback' }
    }
    const content = 'Hello\nthere'
    const before = document.checkpoint().entries.length
    const result = await applyTextEdit(document, 'edited', content, { measure })

    expect(measured).toEqual(['edited'])
    expect(result.measuredIds).toEqual(['edited'])
    expect(result.accepted).toBe(true)
    expect(result.path).toBe('fallback')
    expect(result.width).toBe(12 * content.length * 0.5)
    expect(result.height).toBe(12 * content.split('\n').length)
    expect(document.getNode('edited')?.fields.content).toBe(content)
    expect(document.getNode('other-0')?.fields.content).toBe('xxxxxxxxxx')
    expect(document.checkpoint().entries.length).toBe(before + 1)
    expect(document.checkpoint().entries.at(-1)?.forward).toEqual([
      { kind: 'patch-fields', id: 'edited', fields: { content } }
    ])

    document.apply({ type: 'undo' })
    expect(document.getNode('edited')?.fields.content).toBe('b')
    expect(document.getNode('other-0')?.fields.content).toBe('xxxxxxxxxx')
    expect(document.checkpoint().undone).toBe(1)
    document.apply({ type: 'redo' })
    expect(document.getNode('edited')?.fields.content).toBe(content)
  })

  test('a missing node is not measured and does not record an edit', async () => {
    const document = createDocumentEngine({ name: 'text', id: 'text-missing' })
    const measured: string[] = []
    const measure: TextMeasure = async (node) => {
      measured.push(node.id)
      return { width: 1, height: 1, path: 'fallback' }
    }
    const result = await applyTextEdit(document, 'missing', 'x', { measure })
    expect(result.accepted).toBe(false)
    expect(result.measuredIds).toEqual([])
    expect(measured).toEqual([])
    expect(document.checkpoint().entries).toHaveLength(0)
  })
})

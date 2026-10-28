import { describe, expect, test } from 'bun:test'

import { copyFragment, createDocumentEngine, pasteFragment } from '@open-pencil/engine'
import type { JSONValue } from '@open-pencil/session'

const EMPTY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0" width="0" height="0"></svg>'

interface FragmentFixture {
  id: string
  type: string
  fields: Record<string, JSONValue>
  passthrough: Record<string, JSONValue>
  children: FragmentFixture[]
}

function node(
  id: string,
  type: string,
  fields: Record<string, JSONValue>,
  children: FragmentFixture[] = [],
  passthrough: Record<string, JSONValue> = {}
): FragmentFixture {
  return { id, type, fields, passthrough, children }
}

describe('clipboard fragment', () => {
  test('copyFragment returns a pen-like fragment, svg, and a null png', () => {
    const source = createDocumentEngine({ name: 'source', id: 'source' })
    expect(
      source.apply({
        type: 'create',
        parentId: null,
        index: 0,
        node: {
          id: 'frame',
          type: 'frame',
          fields: { name: 'Frame', x: 10, y: 20, width: 100, height: 80 },
          passthrough: { mystery: true }
        }
      }).ack.accepted
    ).toBe(true)
    source.apply({
      type: 'create',
      parentId: 'frame',
      index: 0,
      node: {
        id: 'rect',
        type: 'rectangle',
        fields: { x: 1, y: 2, width: 4, height: 6, fill: '#09f' }
      }
    })
    source.apply({
      type: 'create',
      parentId: 'frame',
      index: 1,
      node: { id: 'label', type: 'text', fields: { content: 'hello' } }
    })
    source.apply({
      type: 'create',
      parentId: 'frame',
      index: 2,
      node: { id: 'oval', type: 'ellipse', fields: { x: 0, y: 0, width: 8, height: 4 } }
    })

    const before = source.checkpoint()
    const copied = copyFragment(source, ['frame', 'rect'])
    expect(source.checkpoint().nodes).toEqual(before.nodes)
    expect(copied.png).toBeNull()
    expect(copied.text).toBe(
      JSON.stringify({
        version: 1,
        children: [
          node(
            'frame',
            'frame',
            { name: 'Frame', x: 10, y: 20, width: 100, height: 80 },
            [
              node('rect', 'rectangle', { x: 1, y: 2, width: 4, height: 6, fill: '#09f' }),
              node('label', 'text', { content: 'hello' }),
              node('oval', 'ellipse', { x: 0, y: 0, width: 8, height: 4 })
            ],
            { mystery: true }
          )
        ]
      })
    )
    expect(copied.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 8 8" width="8" height="8"><rect x="11" y="22" width="4" height="6" fill="#09f"/><ellipse cx="14" cy="22" rx="4" ry="2"/></svg>'
    )
    expect(copied.svg).not.toContain('hello')

    const target = createDocumentEngine({ name: 'target', id: 'target' })
    const pasted = pasteFragment(target, null, 0, copied.text)
    expect(pasted.ack.accepted).toBe(true)
    expect(target.checkpoint().entries).toHaveLength(1)
    expect(target.rootIds).toEqual(['frame'])
    expect(target.getNode('frame')?.passthrough).toEqual({ mystery: true })
    expect(target.getNode('rect')?.parentId).toBe('frame')
    expect(target.getNode('oval')?.fields).toEqual({ x: 0, y: 0, width: 8, height: 4 })
    expect(
      target.readLayerTree({ parentId: null, offset: 0, limit: 10 }).rows.map((row) => row.type)
    ).toEqual(['frame', 'rectangle', 'text', 'ellipse'])
    target.apply({ type: 'undo' })
    expect(target.nodes.size).toBe(0)
    target.apply({ type: 'redo' })
    expect(target.getNode('rect')?.parentId).toBe('frame')
    expect(target.getNode('frame')?.childIds).toEqual(['rect', 'label', 'oval'])
    expect(source.getNode('frame')?.childIds).toEqual(['rect', 'label', 'oval'])
  })

  test('pasteFragment inserts at an index and rejects a missing parent', () => {
    const document = createDocumentEngine({ name: 'order', id: 'order' })
    document.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: { id: 'a', type: 'rectangle', fields: { name: 'a' } }
    })
    document.apply({
      type: 'create',
      parentId: null,
      index: 1,
      node: { id: 'b', type: 'rectangle', fields: { name: 'b' } }
    })
    const text = JSON.stringify({
      version: 1,
      children: [node('p', 'rectangle', { name: 'p', x: 0, y: 0, width: 2, height: 2 })]
    })
    const missing = pasteFragment(document, 'gone', 0, text)
    expect(missing.ack).toEqual({ accepted: false, sequence: 2, reason: 'missing-parent' })
    expect(document.rootIds).toEqual(['a', 'b'])
    expect(pasteFragment(document, null, 1, text).ack.accepted).toBe(true)
    expect(document.rootIds).toEqual(['a', 'p', 'b'])
    document.apply({ type: 'undo' })
    expect(document.rootIds).toEqual(['a', 'b'])
  })

  test('pasteFragment rejects text that is not a fragment', () => {
    const document = createDocumentEngine({ name: 'bad', id: 'bad' })
    document.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: { id: 'a', type: 'rectangle', fields: { name: 'a' } }
    })
    const before = document.checkpoint()
    const samples = [
      '',
      '[]',
      '{"version":2,"children":[]}',
      '{"version":1}',
      '{"version":1,"children":[{"id":"","type":"rectangle"}]}',
      '{"version":1,"children":[{"id":"n","type":"rectangle","fields":[]}]}'
    ]
    for (const text of samples) {
      const result = pasteFragment(document, null, 0, text)
      expect(result.ack.accepted).toBe(false)
      expect(result.ack.reason).toBe('invalid-fragment')
    }
    expect(document.checkpoint().nodes).toEqual(before.nodes)
    expect(document.checkpoint().entries).toEqual(before.entries)
  })

  test('pasteFragment remaps ids that already exist and undoes them together', () => {
    const document = createDocumentEngine({ name: 'ids', id: 'ids' })
    const duplicates = JSON.stringify({
      version: 1,
      children: [
        node('same', 'rectangle', { name: 'first' }),
        node('same', 'ellipse', { name: 'second' })
      ]
    })
    expect(pasteFragment(document, null, 0, duplicates).ack.accepted).toBe(true)
    expect(document.rootIds).toHaveLength(2)
    expect(document.rootIds[0]).toBe('same')
    expect(document.getNode('same')?.type).toBe('rectangle')
    const second = document.rootIds[1]
    expect(second).not.toBe('same')
    expect(document.getNode(second)?.type).toBe('ellipse')
    document.apply({ type: 'undo' })
    expect(document.nodes.size).toBe(0)

    document.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: { id: 'box', type: 'rectangle', fields: { name: 'original' } }
    })
    const intoSelf = JSON.stringify({
      version: 1,
      children: [
        node('box', 'ellipse', { name: 'pasted' }, [node('box', 'rectangle', { name: 'inner' })])
      ]
    })
    expect(pasteFragment(document, 'box', 0, intoSelf).ack.accepted).toBe(true)
    expect(document.getNode('box')?.fields.name).toBe('original')
    expect(document.getNode('box')?.childIds).toHaveLength(1)
    const pastedId = document.getNode('box')?.childIds[0]
    if (typeof pastedId !== 'string') throw new Error('missing pasted id')
    expect(pastedId).not.toBe('box')
    expect(document.getNode(pastedId)?.type).toBe('ellipse')
    const innerId = document.getNode(pastedId)?.childIds[0]
    if (typeof innerId !== 'string') throw new Error('missing inner id')
    expect(document.getNode(innerId)?.fields.name).toBe('inner')
    document.apply({ type: 'undo' })
    expect(document.nodes.size).toBe(1)
    expect(document.getNode('box')?.childIds).toEqual([])
  })

  test('an empty copy has no shapes and does not record an undo step', () => {
    const document = createDocumentEngine({ name: 'empty', id: 'empty' })
    const copied = copyFragment(document, ['missing'])
    expect(copied.png).toBeNull()
    expect(copied.svg).toBe(EMPTY_SVG)
    expect(copied.text).toBe('{"version":1,"children":[]}')
    const pasted = pasteFragment(document, null, 0, copied.text)
    expect(pasted.ack.accepted).toBe(true)
    expect(document.checkpoint().entries).toHaveLength(0)
  })

  test('svg escapes shape attributes', () => {
    const document = createDocumentEngine({ name: 'svg', id: 'svg' })
    document.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: {
        id: 'r',
        type: 'rectangle',
        fields: { x: 0, y: 0, width: 1, height: 1, fill: 'a<b>&"c' }
      }
    })
    expect(copyFragment(document, ['r']).svg).toContain('fill="a&lt;b&gt;&amp;&quot;c"')
  })

  test('pasteFragment does not write into a disposed document', () => {
    const document = createDocumentEngine({ name: 'gone', id: 'gone' })
    document.dispose()
    const result = pasteFragment(
      document,
      null,
      0,
      JSON.stringify({
        version: 1,
        children: [node('a', 'rectangle', { x: 1, y: 1, width: 1, height: 1 })]
      })
    )
    expect(result.ack.accepted).toBe(false)
    expect(result.ack.reason).toBe('disposed')
    expect(document.nodes.size).toBe(0)
  })
})

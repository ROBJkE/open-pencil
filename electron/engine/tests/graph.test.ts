import { describe, expect, test } from 'bun:test'

import { createDocumentEngine } from '@open-pencil/engine'
import type { Command } from '@open-pencil/session'

function create(id: string, fields: Record<string, string | number> = {}): Command {
  return {
    type: 'create',
    parentId: null,
    index: 0,
    node: { id, type: 'rectangle', fields: { name: id, ...fields } }
  }
}

describe('document engine', () => {
  test('two documents do not share nodes', () => {
    const first = createDocumentEngine({ name: 'A', id: 'a' })
    const second = createDocumentEngine({ name: 'B', id: 'b' })
    first.apply(create('one', { x: 0, y: 0, width: 10, height: 10 }))
    expect(second.readLayerTree({ parentId: null, offset: 0, limit: 20 }).total).toBe(0)
    expect(first.readSpatialIndex()).toEqual([
      { id: 'one', pageId: 'one', x: 0, y: 0, width: 10, height: 10 }
    ])
  })

  test('undo restores a coalesced scrub and a structural edit', () => {
    const document = createDocumentEngine({ name: 'edits', id: 'edits' })
    document.apply(create('rect', { x: 1 }))
    document.apply({ type: 'edit', id: 'rect', fields: { x: 4 }, coalesceKey: 'x' })
    document.apply({ type: 'edit', id: 'rect', fields: { x: 8 }, coalesceKey: 'x' })
    document.apply({ type: 'undo' })
    expect(document.getNode('rect')?.fields.x).toBe(1)
    document.apply({ type: 'delete', ids: ['rect'] })
    expect(document.getNode('rect')).toBeUndefined()
    document.apply({ type: 'undo' })
    expect(document.getNode('rect')?.fields.x).toBe(1)
  })

  test('the layer tree returns a window, not the whole document', () => {
    const document = createDocumentEngine({ name: 'layers', id: 'layers' })
    for (let index = 0; index < 30; index += 1) {
      document.apply({
        type: 'create',
        parentId: null,
        index,
        node: { id: `n${index}`, type: 'rectangle', fields: { name: `n${index}` } }
      })
    }
    const window = document.readLayerTree({ parentId: null, offset: 5, limit: 10 })
    expect(window.total).toBe(30)
    expect(window.rows).toHaveLength(10)
    expect(window.rows[0]?.id).toBe('n5')
  })

  test('a preview commits as one undo step', () => {
    const document = createDocumentEngine({ name: 'preview', id: 'preview' })
    document.apply(create('rect', { x: 1 }))
    document.apply({ type: 'preview', edits: [{ id: 'rect', fields: { x: 20 } }] })
    expect(document.readSelection().ids).toEqual([])
    document.apply({ type: 'set-selection', ids: ['rect'] })
    expect(document.readSelection().fields.x).toBe(20)
    document.apply({ type: 'commit-preview' })
    expect(document.getNode('rect')?.fields.x).toBe(20)
    document.apply({ type: 'undo' })
    expect(document.getNode('rect')?.fields.x).toBe(1)
  })

  test('undo restores a group and a boolean', () => {
    const document = createDocumentEngine({ name: 'structure', id: 'structure' })
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
      node: { id: 'b', type: 'ellipse', fields: { name: 'b' } }
    })
    document.apply({
      type: 'create',
      parentId: null,
      index: 2,
      node: { id: 'c', type: 'rectangle', fields: { name: 'c' } }
    })

    document.apply({ type: 'group', ids: ['a', 'b'] })
    expect(document.nodes.size).toBe(4)
    expect(document.rootIds).toHaveLength(2)
    expect(document.rootIds[1]).toBe('c')
    const groupId = document.rootIds[0]
    expect(document.getNode(groupId)?.type).toBe('group')
    expect(document.getNode(groupId)?.childIds).toEqual(['a', 'b'])
    document.apply({ type: 'undo' })
    expect(document.rootIds).toEqual(['a', 'b', 'c'])
    expect(document.nodes.size).toBe(3)
    expect(document.getNode(groupId)).toBeUndefined()
    document.apply({ type: 'redo' })
    expect(document.rootIds).toEqual([groupId, 'c'])
    expect(document.getNode(groupId)?.childIds).toEqual(['a', 'b'])
    document.apply({ type: 'undo' })

    document.apply({ type: 'boolean', ids: ['a', 'b'], op: 'subtract' })
    expect(document.nodes.size).toBe(4)
    expect(document.rootIds[1]).toBe('c')
    const booleanId = document.rootIds[0]
    expect(document.getNode(booleanId)?.type).toBe('boolean')
    expect(document.getNode(booleanId)?.fields.op).toBe('subtract')
    expect(document.getNode(booleanId)?.childIds).toEqual(['a', 'b'])
    document.apply({ type: 'undo' })
    expect(document.rootIds).toEqual(['a', 'b', 'c'])
    expect(document.nodes.size).toBe(3)
    expect(document.getNode(booleanId)).toBeUndefined()
    expect(document.getNode('a')?.parentId).toBeNull()
    expect(document.getNode('b')?.parentId).toBeNull()
  })

  test('unknown fields stay in passthrough and round-trip through checkpoint', () => {
    const document = createDocumentEngine({ name: 'pass', id: 'pass' })
    document.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: {
        id: 'rect',
        type: 'rectangle',
        fields: { name: 'rect', x: 1 },
        passthrough: { vendor: 'kept', nested: { a: 1 } }
      }
    })
    document.apply({ type: 'edit', id: 'rect', fields: { x: 5 } })
    expect(document.getNode('rect')?.fields).toEqual({ name: 'rect', x: 5 })
    expect(document.getNode('rect')?.passthrough).toEqual({ vendor: 'kept', nested: { a: 1 } })
    const restored = createDocumentEngine({ name: 'restored', id: 'restored' })
    restored.restore(document.checkpoint())
    expect(restored.getNode('rect')?.passthrough).toEqual({ vendor: 'kept', nested: { a: 1 } })
    expect(restored.getNode('rect')?.fields.x).toBe(5)
  })

  test('reset-override and swap-variant stay unimplemented', () => {
    const document = createDocumentEngine({ name: 'later', id: 'later' })
    document.apply(create('rect', { x: 1 }))
    const reset = document.apply({ type: 'reset-override', id: 'rect' })
    const swap = document.apply({
      type: 'swap-variant',
      id: 'rect',
      properties: { size: 'lg' }
    })
    expect(reset.ack.accepted).toBe(false)
    expect(reset.ack.reason).toBe('unimplemented')
    expect(swap.ack.accepted).toBe(false)
    expect(swap.ack.reason).toBe('unimplemented')
    expect(document.getNode('rect')?.fields.x).toBe(1)
    expect(document.checkpoint().entries).toHaveLength(1)
  })
})

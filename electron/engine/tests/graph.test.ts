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
})

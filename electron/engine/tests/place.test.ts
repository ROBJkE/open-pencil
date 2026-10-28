import { describe, expect, test } from 'bun:test'

import { localKeepingOrigin, worldOrigin, type PlacementBox } from '#engine/graph/placement'

import { createDocumentEngine } from '@open-pencil/engine'
import type { Command, SessionEvent } from '@open-pencil/session'

function create(
  id: string,
  type: string,
  parentId: string | null,
  index: number,
  fields: Record<string, number | string>
): Command {
  return { type: 'create', parentId, index, node: { id, type, fields } }
}

function upsert(events: readonly SessionEvent[]) {
  const event = events.find((entry) => entry.type === 'spatial')
  if (!event) throw new Error('expected a spatial event')
  return event.delta.upsert
}

function nestedDocument() {
  const document = createDocumentEngine({ name: 'nested', id: 'nested' })
  document.apply(create('page', 'page', null, 0, { name: 'Page 1' }))
  document.apply(
    create('outer', 'frame', 'page', 0, { name: 'Outer', x: 100, y: 100, width: 200, height: 200 })
  )
  document.apply(
    create('inner', 'frame', 'page', 1, { name: 'Inner', x: 150, y: 160, width: 40, height: 40 })
  )
  document.apply(create('leaf', 'rectangle', 'inner', 0, { x: 5, y: 6, width: 8, height: 8 }))
  document.apply(
    create('rect', 'rectangle', 'page', 2, { name: 'Rect', x: 0, y: 0, width: 10, height: 10 })
  )
  return document
}

describe('place-layer', () => {
  test('nesting keeps the world position and undoes in one step', () => {
    const document = nestedDocument()
    const placed = document.apply({
      type: 'place-layer',
      id: 'inner',
      targetId: 'outer',
      position: 'into'
    })
    expect(placed.ack.accepted).toBe(true)
    expect(document.getNode('inner')?.parentId).toBe('outer')
    expect(document.getNode('outer')?.childIds).toEqual(['inner'])
    expect(document.getNode('inner')?.fields).toMatchObject({ x: 50, y: 60 })
    expect(document.expanded.has('outer')).toBe(true)
    expect(document.readSpatialIndex().find((entry) => entry.id === 'inner')).toEqual({
      id: 'inner',
      pageId: 'page',
      x: 150,
      y: 160,
      width: 40,
      height: 40,
      localX: 50,
      localY: 60
    })
    expect(document.readSpatialIndex().find((entry) => entry.id === 'leaf')).toMatchObject({
      x: 155,
      y: 166,
      localX: 5,
      localY: 6
    })

    document.apply({ type: 'undo' })
    expect(document.getNode('inner')?.parentId).toBe('page')
    expect(document.getNode('inner')?.fields).toMatchObject({ x: 150, y: 160 })
    expect(document.getNode('page')?.childIds).toEqual(['outer', 'inner', 'rect'])

    document.apply({ type: 'redo' })
    expect(document.getNode('inner')?.parentId).toBe('outer')
    expect(document.getNode('inner')?.fields).toMatchObject({ x: 50, y: 60 })
  })

  test('moving the outer frame publishes descendant world bounds', () => {
    const document = nestedDocument()
    document.apply({ type: 'place-layer', id: 'inner', targetId: 'outer', position: 'into' })
    const preview = document.apply({
      type: 'preview',
      edits: [{ id: 'outer', fields: { x: 130 } }]
    })
    expect(upsert(preview.events).find((entry) => entry.id === 'leaf')).toMatchObject({
      x: 185,
      y: 166,
      localX: 5,
      localY: 6
    })
    expect(document.getNode('outer')?.fields.x).toBe(100)
    document.apply({ type: 'cancel-preview' })

    const edited = document.apply({ type: 'edit', id: 'outer', fields: { x: 110 } })
    expect(upsert(edited.events).map((entry) => entry.id)).toEqual(['outer', 'inner', 'leaf'])
    expect(upsert(edited.events).find((entry) => entry.id === 'leaf')).toMatchObject({
      x: 165,
      y: 166
    })
  })

  test('a cycle and a non-container are refused', () => {
    const document = nestedDocument()
    document.apply({ type: 'place-layer', id: 'inner', targetId: 'outer', position: 'into' })
    expect(
      document.apply({ type: 'place-layer', id: 'outer', targetId: 'inner', position: 'into' }).ack
    ).toMatchObject({ accepted: false, reason: 'cycle' })
    expect(document.getNode('outer')?.parentId).toBe('page')
    expect(
      document.apply({ type: 'place-layer', id: 'outer', targetId: 'rect', position: 'into' }).ack
    ).toMatchObject({ accepted: false, reason: 'not-container' })
    expect(document.getNode('outer')?.parentId).toBe('page')
  })

  test('reordering in the same parent does not change coordinates', () => {
    const document = nestedDocument()
    const moved = document.apply({
      type: 'place-layer',
      id: 'outer',
      targetId: 'inner',
      position: 'after'
    })
    expect(moved.ack.accepted).toBe(true)
    expect(document.getNode('page')?.childIds).toEqual(['inner', 'outer', 'rect'])
    expect(document.getNode('outer')?.fields).toMatchObject({ x: 100, y: 100 })
    document.apply({ type: 'undo' })
    expect(document.getNode('page')?.childIds).toEqual(['outer', 'inner', 'rect'])
  })

  test('reparent leaves local coordinates alone', () => {
    const document = nestedDocument()
    document.apply({ type: 'reparent', id: 'inner', parentId: 'outer', index: 0 })
    expect(document.getNode('inner')?.parentId).toBe('outer')
    expect(document.getNode('inner')?.fields).toMatchObject({ x: 150, y: 160 })
  })
})

describe('placement', () => {
  test('a rotated parent keeps the world origin', () => {
    const ancestors: PlacementBox[] = [{ x: 100, y: 40, width: 80, height: 50, rotation: 30 }]
    const local = localKeepingOrigin([], ancestors, 12, 7)
    expect(local).not.toBeNull()
    if (!local) return
    const [x, y] = worldOrigin(ancestors, local.x, local.y)
    expect(x).toBeCloseTo(12)
    expect(y).toBeCloseTo(7)
  })
})

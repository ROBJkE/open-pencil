import { describe, expect, test } from 'bun:test'

import {
  applySpatialDelta,
  hitTest,
  hitsInRect,
  snap,
  toolCommands,
  type GesturePhase,
  type Point
} from '#engine/interaction'

import { createDocumentEngine } from '@open-pencil/engine'
import type { BoundsEntry, CanvasTool, Command } from '@open-pencil/session'

function bounds(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  pageId: string | null = 'page'
): BoundsEntry {
  return { id, pageId, x, y, width, height }
}

function drag(
  tool: CanvasTool,
  phase: GesturePhase,
  from: Point,
  to: Point,
  options: { id?: string; parentId?: string | null; index?: number; constrain?: boolean } = {}
): Command[] {
  return toolCommands(tool, {
    kind: 'draw',
    phase,
    id: options.id ?? 'node',
    parentId: options.parentId ?? null,
    index: options.index ?? 0,
    from,
    to,
    constrain: options.constrain
  })
}

function onlyCreate(commands: readonly Command[]): Extract<Command, { type: 'create' }> {
  expect(commands.map((command) => command.type)).toEqual(['create'])
  const command = commands[0]
  if (command.type !== 'create') throw new Error('expected one create command')
  return command
}

const box = { x: 10, y: 20, width: 40, height: 15 }
const from: Point = { x: 10, y: 20 }
const to: Point = { x: 50, y: 35 }

describe('hit testing', () => {
  const entries = [bounds('back', 0, 0, 100, 100), bounds('front', 10, 10, 20, 20)]

  test('the topmost bounds win, and a miss is null', () => {
    expect(hitTest(entries, 12, 12)).toBe('front')
    expect(hitTest(entries, 90, 90)).toBe('back')
    expect(hitTest(entries, 200, 200)).toBeNull()
    expect(hitTest([], 0, 0)).toBeNull()
    expect(hitTest(entries, Number.NaN, 0)).toBeNull()
  })

  test('edges count, including a zero-thickness line and a negative box', () => {
    expect(hitTest([bounds('line', 0, 5, 20, 0)], 0, 5)).toBe('line')
    expect(hitTest([bounds('line', 0, 5, 20, 0)], 20, 5)).toBe('line')
    expect(hitTest([bounds('line', 0, 5, 20, 0)], 10, 6)).toBeNull()
    expect(hitTest([bounds('flipped', 30, 10, -20, -4)], 15, 8)).toBe('flipped')
    expect(hitTest([bounds('flipped', 30, 10, -20, -4)], 31, 8)).toBeNull()
    const broken: BoundsEntry = {
      id: 'bad',
      pageId: 'page',
      x: 0,
      y: 0,
      width: Number.NaN,
      height: 10
    }
    expect(hitTest([bounds('ok', 0, 0, 10, 10), broken], 1, 1)).toBe('ok')
  })

  test('a marquee reads the same index, topmost first', () => {
    expect(hitsInRect(entries, { x: 0, y: 0, width: 100, height: 100 })).toEqual(['front', 'back'])
    expect(hitsInRect(entries, { x: 90, y: 90, width: 10, height: 10 })).toEqual(['back'])
    expect(hitsInRect(entries, { x: 200, y: 200, width: 5, height: 5 })).toEqual([])
  })

  test('a spatial delta updates the local copy and leaves the previous one alone', () => {
    const moved = applySpatialDelta(entries, {
      generation: 2,
      upsert: [bounds('front', 0, 0, 5, 5)],
      remove: []
    })
    expect(hitTest(moved, 12, 12)).toBe('back')
    expect(hitTest(entries, 12, 12)).toBe('front')

    const raised = applySpatialDelta([bounds('top', 0, 0, 10, 10), bounds('under', 0, 0, 10, 10)], {
      generation: 3,
      remove: ['top'],
      upsert: [bounds('top', 0, 0, 10, 10)]
    })
    expect(raised.map((entry) => entry.id)).toEqual(['under', 'top'])
    expect(hitTest(raised, 1, 1)).toBe('top')
  })
})

describe('snapping', () => {
  test('a point snaps to the nearest edges on each axis', () => {
    const entries = [bounds('box', 0, 0, 100, 40)]
    const before = structuredClone(entries)
    expect(snap(entries, { x: 98, y: 2 }, 5)).toEqual({
      point: { x: 100, y: 0 },
      dx: 2,
      dy: -2,
      guides: [
        { axis: 'x', position: 100, id: 'box' },
        { axis: 'y', position: 0, id: 'box' }
      ]
    })
    expect(entries).toEqual(before)
  })

  test('centers and distant edges are left alone', () => {
    const entries = [bounds('box', 0, 0, 100, 40)]
    expect(snap(entries, { x: 50, y: 20 }, 4)).toEqual({
      point: { x: 50, y: 20 },
      dx: 0,
      dy: 0,
      guides: []
    })
    expect(snap(entries, { x: 1, y: 1 }, -1).point).toEqual({ x: 1, y: 1 })
  })

  test('a tie keeps the earlier edge, and a closer node wins', () => {
    expect(snap([bounds('box', 0, 0, 10, 10)], { x: 5, y: 100 }, 5).point.x).toBe(0)
    expect(
      snap([bounds('far', 0, 0, 10, 10), bounds('near', 100, 0, 10, 10)], { x: 97, y: 100 }, 5)
        .guides
    ).toEqual([{ axis: 'x', position: 100, id: 'near' }])
  })

  test('edges on the same line are both reported, and the threshold is inclusive', () => {
    const entries = [bounds('a', 0, 0, 10, 10), bounds('b', 0, 4, 20, 10)]
    expect(snap(entries, { x: -4, y: 100 }, 5).guides).toEqual([
      { axis: 'x', position: 0, id: 'a' },
      { axis: 'x', position: 0, id: 'b' }
    ])
    expect(snap([bounds('edge', 0, 0, 0, 0)], { x: 5, y: 100 }, 5).point).toEqual({ x: 0, y: 100 })
    expect(snap([bounds('edge', 0, 0, 0, 0)], { x: 5.1, y: 100 }, 5).point).toEqual({
      x: 5.1,
      y: 100
    })
  })
})

describe('hover', () => {
  test('hover is decided on the local index and sends no command', () => {
    const entries = [bounds('back', 0, 0, 100, 100), bounds('front', 10, 10, 20, 20)]
    expect(hitTest(entries, 12, 12)).toBe('front')
    expect(toolCommands('select', { kind: 'hover', point: { x: 12, y: 12 } })).toEqual([])
    expect(toolCommands('rectangle', { kind: 'hover', point: { x: 12, y: 12 } })).toEqual([])
    const updated = applySpatialDelta(entries, {
      generation: 4,
      upsert: [bounds('front', 0, 0, 4, 4)],
      remove: []
    })
    expect(hitTest(updated, 12, 12)).toBe('back')
  })
})

describe('drawing', () => {
  test('a rectangle drag is one create, and undo is the caller', () => {
    const commands = drag('rectangle', 'commit', from, to, { id: 'rect' })
    expect(commands).toEqual([
      {
        type: 'create',
        parentId: null,
        index: 0,
        node: {
          id: 'rect',
          type: 'rectangle',
          fields: { name: 'Rectangle', ...box, fill: '#D9D9D9' }
        }
      }
    ])

    const command = onlyCreate(commands)
    const document = createDocumentEngine({ name: 'draw', id: 'draw' })
    expect(document.apply(command).ack.accepted).toBe(true)
    expect(document.getNode('rect')?.fields).toMatchObject(box)
    document.apply({ type: 'undo' })
    expect(document.getNode('rect')).toBeUndefined()
  })

  test('a drag up and to the left normalizes, and shift keeps a square', () => {
    expect(drag('rectangle', 'commit', to, from, { id: 'rect' })[0]).toMatchObject({
      node: { fields: box }
    })
    expect(
      drag('rectangle', 'commit', { x: 0, y: 0 }, { x: 10, y: 4 }, { constrain: true })
    ).toMatchObject([{ node: { fields: { x: 0, y: 0, width: 10, height: 10 } } }])
  })

  test('a click places the default square', () => {
    const command = onlyCreate(
      drag('rectangle', 'commit', { x: 4, y: 5 }, { x: 5, y: 6 }, { id: 'rect' })
    )
    expect(command.node.fields).toMatchObject({ x: 4, y: 5, width: 100, height: 100 })
  })

  test('a rectangle preview is one preview command, and cancel drops it', () => {
    expect(drag('rectangle', 'preview', from, to, { id: 'rect' })).toEqual([
      { type: 'preview', edits: [{ id: 'rect', fields: box }] }
    ])
    expect(drag('rectangle', 'cancel', from, to, { id: 'rect' })).toEqual([
      { type: 'cancel-preview' }
    ])
  })

  test('the other box tools create one node of their type', () => {
    const appearance = {
      ellipse: { fill: '#D9D9D9' },
      frame: { fill: '#FFFFFF', clip: true },
      section: { fill: '#FFFFFF', cornerRadius: 2 },
      polygon: { fill: '#D9D9D9', polygonCount: 3 },
      star: { fill: '#D9D9D9' },
      text: { fill: '#000000', content: '', textGrowth: 'fixed-width-height' }
    } as const
    for (const tool of ['ellipse', 'frame', 'section', 'polygon', 'star', 'text'] as const) {
      const command = onlyCreate(
        drag(tool, 'commit', from, to, { id: tool, parentId: 'page', index: 2 })
      )
      expect(command.parentId).toBe('page')
      expect(command.index).toBe(2)
      expect(command.node.type).toBe(tool)
      expect(command.node.fields).toMatchObject({ ...box, ...appearance[tool] })
    }
  })

  test('a text click uses the default text size', () => {
    const command = onlyCreate(
      drag('text', 'commit', { x: 8, y: 9 }, { x: 8, y: 9 }, { id: 'label' })
    )
    expect(command.node.fields).toMatchObject({
      x: 8,
      y: 9,
      width: 200,
      height: 24,
      content: '',
      textGrowth: 'auto'
    })
  })

  test('a line is its length and angle, and shift snaps the angle', () => {
    const command = onlyCreate(
      drag('line', 'commit', { x: 0, y: 0 }, { x: 3, y: 4 }, { id: 'line' })
    )
    expect(command.node.fields?.width).toBe(5)
    expect(command.node.fields?.rotation).toBeCloseTo((Math.atan2(4, 3) * 180) / Math.PI, 8)
    expect(command.node.fields).toMatchObject({
      name: 'Line',
      x: 0,
      y: 0,
      height: 0,
      stroke: '#000000',
      strokeWidth: 1
    })

    const snapped = onlyCreate(
      drag('line', 'commit', { x: 0, y: 0 }, { x: 10, y: 9 }, { id: 'line', constrain: true })
    )
    expect(snapped.node.fields?.rotation).toBe(45)
    expect(snapped.node.fields?.width).toBeCloseTo(Math.hypot(10, 9), 8)

    const clicked = onlyCreate(
      drag('line', 'commit', { x: 2, y: 3 }, { x: 3, y: 3 }, { id: 'line' })
    )
    expect(clicked.node.fields).toMatchObject({ x: 2, y: 3, width: 100, height: 0, rotation: 0 })
  })

  test('a pen commit is one path, and a single point commits nothing', () => {
    const command = onlyCreate(
      toolCommands('pen', {
        kind: 'pen',
        phase: 'commit',
        id: 'path',
        parentId: null,
        index: 0,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 }
        ],
        closed: true
      })
    )
    expect(command.node).toMatchObject({
      id: 'path',
      type: 'path',
      fields: {
        name: 'Path',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        geometry: 'M 0 0 L 10 0 L 10 10 Z',
        stroke: '#000000',
        strokeWidth: 2
      }
    })
    expect(
      toolCommands('pen', {
        kind: 'pen',
        phase: 'commit',
        id: 'path',
        parentId: null,
        index: 0,
        points: [{ x: 1, y: 1 }]
      })
    ).toEqual([])
  })

  test('a pen drag creates one straight path', () => {
    const command = onlyCreate(
      drag('pen', 'commit', { x: 0, y: 0 }, { x: 30, y: 40 }, { id: 'path' })
    )
    expect(command.node.fields).toMatchObject({
      x: 0,
      y: 0,
      width: 30,
      height: 40,
      geometry: 'M 0 0 L 30 40'
    })
    expect(drag('pen', 'commit', { x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([])
  })
})

describe('preview', () => {
  test('a preview drag commits as one undo step', () => {
    const document = createDocumentEngine({ name: 'preview', id: 'preview' })
    document.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: {
        id: 'rect',
        type: 'rectangle',
        fields: { name: 'rect', x: 1, y: 2, width: 10, height: 10 }
      }
    })
    const preview = toolCommands('select', {
      kind: 'move',
      phase: 'preview',
      origins: [{ id: 'rect', x: 1, y: 2 }],
      dx: 5,
      dy: -1
    })
    expect(preview).toEqual([{ type: 'preview', edits: [{ id: 'rect', fields: { x: 6, y: 1 } }] }])
    const previewCommand = preview[0]
    if (previewCommand.type !== 'preview') throw new Error('expected a preview command')
    document.apply(previewCommand)
    document.apply({ type: 'set-selection', ids: ['rect'] })
    expect(document.readSelection().fields.x).toBe(6)
    expect(document.getNode('rect')?.fields.x).toBe(1)

    const commit = toolCommands('select', {
      kind: 'move',
      phase: 'commit',
      origins: [],
      dx: 0,
      dy: 0
    })
    expect(commit).toEqual([{ type: 'commit-preview' }])
    const commitCommand = commit[0]
    if (commitCommand.type !== 'commit-preview') throw new Error('expected commit-preview')
    document.apply(commitCommand)
    expect(document.getNode('rect')?.fields.x).toBe(6)
    document.apply({ type: 'undo' })
    expect(document.getNode('rect')?.fields.x).toBe(1)
    document.apply({ type: 'undo' })
    expect(document.getNode('rect')).toBeUndefined()
  })

  test('resize and rotate preview geometry, and cancel drops the preview', () => {
    expect(
      toolCommands('select', {
        kind: 'resize',
        phase: 'preview',
        id: 'rect',
        x: 1,
        y: 2,
        width: 30,
        height: 40
      })
    ).toEqual([
      { type: 'preview', edits: [{ id: 'rect', fields: { x: 1, y: 2, width: 30, height: 40 } }] }
    ])
    expect(
      toolCommands('select', { kind: 'rotate', phase: 'preview', id: 'rect', rotation: 45 })
    ).toEqual([{ type: 'preview', edits: [{ id: 'rect', fields: { rotation: 45 } }] }])
    expect(
      toolCommands('select', { kind: 'rotate', phase: 'commit', id: 'rect', rotation: 45 })
    ).toEqual([{ type: 'commit-preview' }])
    expect(
      toolCommands('select', { kind: 'move', phase: 'cancel', origins: [], dx: 0, dy: 0 })
    ).toEqual([{ type: 'cancel-preview' }])
  })

  test('editing a pen path previews its geometry and commits that preview', () => {
    expect(
      toolCommands('vector', {
        kind: 'pen',
        phase: 'preview',
        id: 'path',
        parentId: null,
        index: 0,
        editing: true,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 }
        ]
      })
    ).toEqual([
      {
        type: 'preview',
        edits: [
          { id: 'path', fields: { x: 0, y: 0, width: 4, height: 0, geometry: 'M 0 0 L 4 0' } }
        ]
      }
    ])
    expect(
      toolCommands('pen', {
        kind: 'pen',
        phase: 'commit',
        id: 'path',
        parentId: null,
        index: 0,
        editing: true,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 }
        ]
      })
    ).toEqual([{ type: 'commit-preview' }])
  })
})

describe('select', () => {
  test('a click selects the hit, shift toggles, and a miss clears', () => {
    expect(
      toolCommands('select', { kind: 'click', point: { x: 1, y: 1 }, hitId: 'a', selection: [] })
    ).toEqual([{ type: 'set-selection', ids: ['a'] }])
    expect(
      toolCommands('select', {
        kind: 'click',
        point: { x: 1, y: 1 },
        hitId: 'b',
        selection: ['a'],
        additive: true
      })
    ).toEqual([{ type: 'set-selection', ids: ['a', 'b'] }])
    expect(
      toolCommands('select', {
        kind: 'click',
        point: { x: 1, y: 1 },
        hitId: 'a',
        selection: ['a', 'b'],
        additive: true
      })
    ).toEqual([{ type: 'set-selection', ids: ['b'] }])
    expect(
      toolCommands('select', {
        kind: 'click',
        point: { x: 1, y: 1 },
        hitId: null,
        selection: ['a']
      })
    ).toEqual([{ type: 'set-selection', ids: [] }])
  })

  test('a marquee commit selects the local hits, and the drag itself sends nothing', () => {
    expect(
      toolCommands('select', {
        kind: 'marquee',
        phase: 'commit',
        hits: ['front', 'back'],
        selection: [],
        additive: false
      })
    ).toEqual([{ type: 'set-selection', ids: ['front', 'back'] }])
    expect(
      toolCommands('select', {
        kind: 'marquee',
        phase: 'commit',
        hits: ['front'],
        selection: ['kept'],
        additive: true
      })
    ).toEqual([{ type: 'set-selection', ids: ['kept', 'front'] }])
    expect(
      toolCommands('select', { kind: 'marquee', phase: 'preview', hits: ['front'], selection: [] })
    ).toEqual([])
    expect(drag('select', 'commit', from, to)).toEqual([])
  })
})

describe('hand and zoom', () => {
  const viewport = { zoom: 1, panX: 10, panY: 20, width: 800, height: 600 }

  test('hand pans, and the select tool does not', () => {
    expect(toolCommands('hand', { kind: 'pan', dx: 5, dy: -3, viewport })).toEqual([
      { type: 'set-viewport', zoom: 1, panX: 15, panY: 17, width: 800, height: 600 }
    ])
    expect(toolCommands('select', { kind: 'pan', dx: 5, dy: -3, viewport })).toEqual([])
  })

  test('zoom stays centered on the anchor and clamps', () => {
    expect(
      toolCommands('zoom', {
        kind: 'zoom',
        factor: 2,
        anchor: { x: 10, y: 20 },
        viewport: { zoom: 1, panX: 0, panY: 0, width: 800, height: 600 }
      })
    ).toEqual([{ type: 'set-viewport', zoom: 2, panX: -10, panY: -20, width: 800, height: 600 }])
    expect(
      toolCommands('select', { kind: 'zoom', factor: 2, anchor: { x: 0, y: 0 }, viewport })
    ).toEqual([])

    const clamped = toolCommands('zoom', {
      kind: 'zoom',
      factor: 2,
      anchor: { x: 0, y: 0 },
      viewport: { zoom: 200, panX: 10, panY: 10, width: 100, height: 100 }
    })
    expect(clamped[0]).toMatchObject({ type: 'set-viewport', zoom: 256 })
    if (clamped[0]?.type !== 'set-viewport') throw new Error('expected a viewport command')
    expect(clamped[0].panX).toBeCloseTo(10 * (256 / 200), 8)
    expect(clamped[0].panY).toBeCloseTo(10 * (256 / 200), 8)
    expect(
      toolCommands('zoom', { kind: 'zoom', factor: 0, anchor: { x: 0, y: 0 }, viewport })
    ).toEqual([])
  })

  test('a zoom drag fits the rectangle, and a click does not', () => {
    expect(
      toolCommands('zoom', {
        kind: 'draw',
        phase: 'commit',
        id: 'unused',
        parentId: null,
        index: 0,
        from: { x: 0, y: 0 },
        to: { x: 100, y: 100 },
        viewport: { zoom: 1, panX: 0, panY: 0, width: 200, height: 100 }
      })
    ).toEqual([{ type: 'set-viewport', zoom: 1, panX: 50, panY: 0, width: 200, height: 100 }])
    expect(
      toolCommands('zoom', {
        kind: 'draw',
        phase: 'preview',
        id: 'unused',
        parentId: null,
        index: 0,
        from: { x: 0, y: 0 },
        to: { x: 100, y: 100 },
        viewport: { zoom: 1, panX: 0, panY: 0, width: 200, height: 100 }
      })
    ).toEqual([])
    expect(
      toolCommands('zoom', {
        kind: 'draw',
        phase: 'commit',
        id: 'unused',
        parentId: null,
        index: 0,
        from: { x: 0, y: 0 },
        to: { x: 1, y: 1 },
        viewport: { zoom: 1, panX: 0, panY: 0, width: 200, height: 100 }
      })
    ).toEqual([])
  })
})

import { describe, expect, test } from 'bun:test'

import { dirtySubtreeIds } from '#engine/layout/scope'
import type { LayoutBox, LayoutResult } from '#engine/layout/types'

import type { GraphNode, JSONValue } from '@open-pencil/session'

interface LayoutModule {
  loadLayoutEngine(): Promise<void>
  layoutNodes(nodes: readonly GraphNode[], dirtyIds: readonly string[]): Promise<LayoutResult>
}

function node(
  id: string,
  type: string,
  parentId: string | null,
  childIds: readonly string[],
  fields: Record<string, JSONValue> = {}
): GraphNode {
  return { id, type, parentId, childIds: [...childIds], fields, passthrough: {} }
}

function box(result: LayoutResult, id: string): LayoutBox | undefined {
  return result.boxes.find((entry) => entry.id === id)
}

function expectBox(result: LayoutResult, expected: LayoutBox): void {
  expect(box(result, expected.id)).toEqual(expected)
}

/** Two sibling frames. `deep` and `other` sit in different subtrees. */
function siblings(): GraphNode[] {
  return [
    node('page', 'frame', null, ['left', 'right'], {
      layout: 'none',
      x: 0,
      y: 0,
      width: 400,
      height: 200
    }),
    node('left', 'frame', 'page', ['leaf', 'nest'], {
      layout: 'vertical',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      gap: 4
    }),
    node('leaf', 'rectangle', 'left', [], { x: 4, y: 6, width: 10, height: 10 }),
    node('nest', 'frame', 'left', ['deep'], {
      layout: 'horizontal',
      x: 5,
      y: 6,
      width: 40,
      height: 12
    }),
    node('deep', 'rectangle', 'nest', [], { x: 3, y: 2, width: 8, height: 8 }),
    node('right', 'frame', 'page', ['rightNest'], {
      layout: 'vertical',
      x: 200,
      y: 0,
      width: 90,
      height: 70
    }),
    node('rightNest', 'frame', 'right', ['other'], {
      layout: 'horizontal',
      x: 0,
      y: 0,
      width: 30,
      height: 14
    }),
    node('other', 'rectangle', 'rightNest', [], { x: 7, y: 1, width: 12, height: 12 })
  ]
}

function plain(): GraphNode[] {
  return [
    node('page', 'rectangle', null, ['leaf', 'sibling'], { x: 0, y: 0, width: 80, height: 40 }),
    node('leaf', 'rectangle', 'page', [], { x: 2, y: 3, width: 10, height: 10 }),
    node('sibling', 'rectangle', 'page', ['nested'], { x: 20, y: 4, width: 30, height: 16 }),
    node('nested', 'rectangle', 'sibling', [], { x: 1, y: 1, width: 6, height: 6 })
  ]
}

const loaded = await loadLayoutModule()

async function loadLayoutModule(): Promise<{ api: LayoutModule | null; error: string }> {
  try {
    const api = await import('#engine/layout')
    return { api, error: '' }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    const message = `Yoga WASM did not instantiate under bun: ${detail}. Geometry assertions are skipped.`
    console.warn(message)
    return { api: null, error: message }
  }
}

describe('dirty subtree', () => {
  const tree = siblings()

  test('a leaf edit is that leaf alone', () => {
    expect(dirtySubtreeIds(tree, ['deep'])).toEqual(['deep'])
  })

  test('a frame edit includes its descendants and not its sibling subtree', () => {
    expect(dirtySubtreeIds(tree, ['left'])).toEqual(['left', 'leaf', 'nest', 'deep'])
    expect(dirtySubtreeIds(tree, ['right'])).toEqual(['right', 'rightNest', 'other'])
  })

  test('a dirty parent covers a dirty descendant once', () => {
    expect(dirtySubtreeIds(tree, ['left', 'deep'])).toEqual(['left', 'leaf', 'nest', 'deep'])
  })

  test('two leaves in different branches stay apart', () => {
    expect(dirtySubtreeIds(tree, ['deep', 'other'])).toEqual(['deep', 'other'])
    expect(dirtySubtreeIds(tree, ['nest', 'rightNest'])).toEqual([
      'nest',
      'deep',
      'rightNest',
      'other'
    ])
  })

  test('a cycle contributes the node once', () => {
    const loop = node('a', 'frame', null, ['a'], { layout: 'none' })
    expect(dirtySubtreeIds([loop], ['a'])).toEqual(['a'])
  })

  test('an unknown id adds nothing', () => {
    expect(dirtySubtreeIds(tree, ['missing'])).toEqual([])
  })
})

const layout = loaded.api

if (!layout) {
  test.skip('layout module (Yoga loader did not import)', () => {
    console.warn(loaded.error || 'Yoga WASM did not instantiate under bun')
  })
} else {
  describe('layout without flex', () => {
    test('a leaf edit does not recompute an unrelated sibling subtree', async () => {
      const tree = plain()
      const result = await layout.layoutNodes(tree, ['leaf'])
      expect(result.recomputed).toBe(1)
      expect(result.boxes).toEqual([{ id: 'leaf', x: 2, y: 3, width: 10, height: 10 }])
      expect(result.recomputed).toBeLessThan(tree.length)
    })

    test('a parent edit keeps stored positions when nothing flows', async () => {
      const result = await layout.layoutNodes(plain(), ['sibling'])
      expect(result.recomputed).toBe(2)
      expectBox(result, { id: 'sibling', x: 20, y: 4, width: 30, height: 16 })
      expectBox(result, { id: 'nested', x: 1, y: 1, width: 6, height: 6 })
      expect(box(result, 'leaf')).toBeUndefined()
    })
  })
}

const yoga = await loadYoga(layout)

async function loadYoga(api: LayoutModule | null): Promise<LayoutModule | null> {
  if (!api) return null
  try {
    await api.loadLayoutEngine()
    return api
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Yoga WASM did not instantiate under bun'
    console.warn(`${detail}. Geometry assertions are skipped.`)
    return null
  }
}

if (!yoga) {
  test.skip('yoga geometry (Yoga WASM did not instantiate under bun)', () => {
    console.warn(loaded.error || 'Yoga WASM did not instantiate under bun')
  })
} else {
  const api = yoga

  describe('yoga layout', () => {
    test('horizontal and row place children with gap and padding', async () => {
      for (const layout of ['horizontal', 'row']) {
        const result = await api.layoutNodes(
          [
            node('frame', 'frame', null, ['a', 'b'], {
              layout,
              x: 8,
              y: 9,
              width: 200,
              height: 40,
              gap: 10,
              padding: [0, 0, 0, 5],
              clip: true
            }),
            node('a', 'rectangle', 'frame', [], { width: 20, height: 10 }),
            node('b', 'rectangle', 'frame', [], { width: 30, height: 10 })
          ],
          ['frame']
        )
        expect(result.recomputed).toBe(3)
        expectBox(result, { id: 'frame', x: 8, y: 9, width: 200, height: 40 })
        expectBox(result, { id: 'a', x: 5, y: 0, width: 20, height: 10 })
        expectBox(result, { id: 'b', x: 35, y: 0, width: 30, height: 10 })
      }
    })

    test('vertical and column stack children', async () => {
      for (const layout of ['vertical', 'column']) {
        const result = await api.layoutNodes(
          [
            node('frame', 'frame', null, ['a', 'b'], {
              layout,
              x: 0,
              y: 0,
              width: 50,
              height: 'fit_content',
              gap: 8,
              padding: 4
            }),
            node('a', 'rectangle', 'frame', [], { width: 10, height: 12 }),
            node('b', 'rectangle', 'frame', [], { width: 10, height: 6 })
          ],
          ['frame']
        )
        expectBox(result, { id: 'frame', x: 0, y: 0, width: 50, height: 34 })
        expectBox(result, { id: 'a', x: 4, y: 4, width: 10, height: 12 })
        expectBox(result, { id: 'b', x: 4, y: 24, width: 10, height: 6 })
      }
    })

    test('centers on both axes and packs the main axis to the end', async () => {
      const centered = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a', 'b'], {
            layout: 'horizontal',
            width: 100,
            height: 50,
            justifyContent: 'center',
            alignItems: 'center'
          }),
          node('a', 'rectangle', 'frame', [], { width: 20, height: 10 }),
          node('b', 'rectangle', 'frame', [], { width: 20, height: 10 })
        ],
        ['frame']
      )
      expectBox(centered, { id: 'a', x: 30, y: 20, width: 20, height: 10 })
      expectBox(centered, { id: 'b', x: 50, y: 20, width: 20, height: 10 })

      const end = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a'], {
            layout: 'horizontal',
            width: 100,
            height: 30,
            justifyContent: 'end'
          }),
          node('a', 'rectangle', 'frame', [], { width: 20, height: 10 })
        ],
        ['frame']
      )
      expectBox(end, { id: 'a', x: 80, y: 0, width: 20, height: 10 })
    })

    test('space_between ignores the gap and fill_container takes the free space', async () => {
      const spaced = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a', 'b'], {
            layout: 'horizontal',
            width: 100,
            height: 20,
            gap: 10,
            justifyContent: 'space_between'
          }),
          node('a', 'rectangle', 'frame', [], { width: 20, height: 10 }),
          node('b', 'rectangle', 'frame', [], { width: 20, height: 10 })
        ],
        ['frame']
      )
      expectBox(spaced, { id: 'a', x: 0, y: 0, width: 20, height: 10 })
      expectBox(spaced, { id: 'b', x: 80, y: 0, width: 20, height: 10 })

      const filled = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a', 'b'], {
            layout: 'horizontal',
            width: 100,
            height: 20
          }),
          node('a', 'rectangle', 'frame', [], { width: 20, height: 10 }),
          node('b', 'rectangle', 'frame', [], { width: 'fill_container', height: 10 })
        ],
        ['frame']
      )
      expectBox(filled, { id: 'b', x: 20, y: 0, width: 80, height: 10 })
    })

    test('fit_content hugs children and stretch fills the cross axis', async () => {
      const hugged = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a', 'b'], {
            layout: 'horizontal',
            width: 'fit_content',
            height: 'fit_content',
            gap: 10
          }),
          node('a', 'rectangle', 'frame', [], { width: 20, height: 10 }),
          node('b', 'rectangle', 'frame', [], { width: 30, height: 15 })
        ],
        ['frame']
      )
      expectBox(hugged, { id: 'frame', x: 0, y: 0, width: 60, height: 15 })
      expectBox(hugged, { id: 'b', x: 30, y: 0, width: 30, height: 15 })

      const stretched = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a'], {
            layout: 'horizontal',
            width: 80,
            height: 40,
            alignItems: 'stretch'
          }),
          node('a', 'rectangle', 'frame', [], { width: 20 })
        ],
        ['frame']
      )
      expectBox(stretched, { id: 'a', x: 0, y: 0, width: 20, height: 40 })
    })

    test('a frame with no layout field lays out as a row', async () => {
      const result = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a', 'b'], { width: 100, height: 20 }),
          node('a', 'rectangle', 'frame', [], { width: 15, height: 10 }),
          node('b', 'rectangle', 'frame', [], { width: 15, height: 10 })
        ],
        ['frame']
      )
      expectBox(result, { id: 'a', x: 0, y: 0, width: 15, height: 10 })
      expectBox(result, { id: 'b', x: 15, y: 0, width: 15, height: 10 })
    })

    test('padding shorthand and a hidden child leave the flow', async () => {
      const result = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a', 'hidden', 'c'], {
            layout: 'horizontal',
            width: 100,
            height: 40,
            padding: [10, 20]
          }),
          node('a', 'rectangle', 'frame', [], { width: 10, height: 10 }),
          node('hidden', 'rectangle', 'frame', [], { width: 10, height: 10, enabled: false }),
          node('c', 'rectangle', 'frame', [], { width: 12, height: 10 })
        ],
        ['frame']
      )
      expectBox(result, { id: 'a', x: 20, y: 10, width: 10, height: 10 })
      expectBox(result, { id: 'c', x: 30, y: 10, width: 12, height: 10 })
      expectBox(result, { id: 'hidden', x: 0, y: 0, width: 10, height: 10 })
      expect(result.recomputed).toBe(4)
    })

    test('an absolute child keeps its place and does not push the flow', async () => {
      const result = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a', 'abs', 'c'], {
            layout: 'horizontal',
            width: 100,
            height: 40
          }),
          node('a', 'rectangle', 'frame', [], { width: 10, height: 10 }),
          node('abs', 'rectangle', 'frame', [], {
            layoutPosition: 'absolute',
            x: 30,
            y: 5,
            width: 8,
            height: 8
          }),
          node('c', 'rectangle', 'frame', [], { width: 12, height: 10 })
        ],
        ['frame']
      )
      expectBox(result, { id: 'a', x: 0, y: 0, width: 10, height: 10 })
      expectBox(result, { id: 'abs', x: 30, y: 5, width: 8, height: 8 })
      expectBox(result, { id: 'c', x: 10, y: 0, width: 12, height: 10 })
    })

    test('grid places the third child on the next row', async () => {
      const result = await api.layoutNodes(
        [
          node('frame', 'frame', null, ['a', 'b', 'c'], {
            layout: 'grid',
            x: 1,
            y: 2,
            width: 100,
            height: 40,
            columns: 2
          }),
          node('a', 'rectangle', 'frame', [], { width: 10, height: 10 }),
          node('b', 'rectangle', 'frame', [], { width: 10, height: 10 }),
          node('c', 'rectangle', 'frame', [], { width: 10, height: 10 })
        ],
        ['frame']
      )
      expect(result.recomputed).toBe(4)
      expectBox(result, { id: 'frame', x: 1, y: 2, width: 100, height: 40 })
      expectBox(result, { id: 'a', x: 0, y: 0, width: 10, height: 10 })
      expectBox(result, { id: 'b', x: 50, y: 0, width: 10, height: 10 })
      expectBox(result, { id: 'c', x: 0, y: 10, width: 10, height: 10 })
    })

    test('a leaf edit does not recompute an unrelated sibling subtree', async () => {
      const tree = siblings()
      const leaf = await api.layoutNodes(tree, ['deep'])
      expect(leaf.recomputed).toBe(1)
      expect(leaf.boxes).toEqual([{ id: 'deep', x: 3, y: 2, width: 8, height: 8 }])
      expect(leaf.recomputed).toBeLessThan(tree.length)

      const nest = await api.layoutNodes(tree, ['nest'])
      expect(nest.recomputed).toBe(2)
      expect(nest.boxes.map((entry) => entry.id).sort()).toEqual(['deep', 'nest'])
      expectBox(nest, { id: 'nest', x: 5, y: 6, width: 40, height: 12 })
      expectBox(nest, { id: 'deep', x: 0, y: 0, width: 8, height: 8 })

      const left = await api.layoutNodes(tree, ['left'])
      expect(left.recomputed).toBe(4)
      expect(left.boxes.map((entry) => entry.id).sort()).toEqual(['deep', 'leaf', 'left', 'nest'])
      expectBox(left, { id: 'left', x: 0, y: 0, width: 100, height: 80 })
      expectBox(left, { id: 'leaf', x: 0, y: 0, width: 10, height: 10 })
      expectBox(left, { id: 'nest', x: 0, y: 14, width: 40, height: 12 })
      expectBox(left, { id: 'deep', x: 0, y: 0, width: 8, height: 8 })
      expect(box(left, 'other')).toBeUndefined()
      expect(box(left, 'rightNest')).toBeUndefined()
    })
  })
}

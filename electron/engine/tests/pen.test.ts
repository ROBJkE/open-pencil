import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPenCodec } from '@open-pencil/engine'
import {
  checkpointToBytes,
  InvalidDocumentError,
  type Checkpoint,
  type GraphNode
} from '@open-pencil/session'

function workspaceRoot(from = dirname(fileURLToPath(import.meta.url))): string {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'bun.lock'))) return dir
    if (dirname(dir) === dir) throw new Error(`No workspace root above ${from}`)
  }
}

function session(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    version: 1,
    nodes: [],
    rootIds: [],
    selection: [],
    hoverId: null,
    tool: 'select',
    viewport: { pageId: null, zoom: 1, panX: 0, panY: 0, width: 0, height: 0 },
    expanded: [],
    entries: [],
    undone: 0,
    ...overrides
  }
}

const rectangle: GraphNode = {
  id: 'rect',
  type: 'rectangle',
  parentId: null,
  childIds: [],
  fields: { name: 'Box', x: 12, y: 8, width: 100, height: 40, fill: '#4094D0' },
  passthrough: { vendorTag: 'keep', nested: { a: 1 } }
}

describe('pen codec', () => {
  test('round-trips a rectangle and a comment', () => {
    const codec = createPenCodec()
    const checkpoint = session({
      nodes: [rectangle],
      rootIds: ['rect'],
      comments: {
        thread: { nodeId: 'rect', body: 'Check the spacing', resolved: false, author: 'ada' }
      }
    })
    const bytes = codec.write(checkpoint)
    const text = new TextDecoder().decode(bytes)

    expect(text).toContain('"version":"2.21"')
    expect(text).toContain('"children"')
    const read = codec.read(bytes)
    expect(read.version).toBe(1)
    expect(read.rootIds).toEqual(['rect'])
    expect(read.nodes).toEqual([rectangle])
    expect(read.comments).toEqual(checkpoint.comments)
  })

  test('nests children in root order', () => {
    const codec = createPenCodec()
    const frame: GraphNode = {
      id: 'frame',
      type: 'frame',
      parentId: null,
      childIds: ['rect', 'ellipse'],
      fields: { name: 'Frame' },
      passthrough: {}
    }
    const child: GraphNode = { ...rectangle, parentId: 'frame' }
    const ellipse: GraphNode = {
      id: 'ellipse',
      type: 'ellipse',
      parentId: 'frame',
      childIds: [],
      fields: { name: 'Dot', width: 20, height: 20 },
      passthrough: {}
    }
    const read = codec.read(
      codec.write(
        session({
          nodes: [frame, child, ellipse],
          rootIds: ['frame']
        })
      )
    )

    expect(read.rootIds).toEqual(['frame'])
    expect(read.nodes.map((node) => node.id)).toEqual(['frame', 'rect', 'ellipse'])
    expect(read.nodes[0]?.childIds).toEqual(['rect', 'ellipse'])
    expect(read.nodes[1]?.parentId).toBe('frame')
    expect(read.nodes[2]?.fields.name).toBe('Dot')
  })

  test('round-trips variables, shaders, lint dismissals, and imports', () => {
    const codec = createPenCodec()
    const checkpoint = session({
      nodes: [{ ...rectangle, passthrough: {} }],
      rootIds: ['rect'],
      variables: { accent: { type: 'color', value: '#4094D0' } },
      shaders: { rect: { components: [{ type: 'noise', speed: 1 }] } },
      lintDismissals: { 'rect:contrast': true, 'rect:spacing': false },
      libraries: { icons: './icons.pen' }
    })
    const read = codec.read(codec.write(checkpoint))

    expect(read.variables).toEqual(checkpoint.variables)
    expect(read.shaders).toEqual(checkpoint.shaders)
    expect(read.lintDismissals).toEqual(checkpoint.lintDismissals)
    expect(read.libraries).toEqual(checkpoint.libraries)
  })

  test('writes an engine variable bag as pen variables', () => {
    const codec = createPenCodec()
    const read = codec.read(
      codec.write(
        session({
          variables: {
            gap: { value: 8 },
            shown: { value: true },
            label: { value: 'Sans', theme: { Mode: 'Dark' } },
            accent: { type: 'color', value: '#4094D0' }
          }
        })
      )
    )

    expect(read.variables).toEqual({
      gap: { type: 'number', value: 8 },
      shown: { type: 'boolean', value: true },
      label: { type: 'string', value: [{ value: 'Sans', theme: { Mode: 'Dark' } }] },
      accent: { type: 'color', value: '#4094D0' }
    })
  })

  test('keeps a boolean operation in fields', () => {
    const codec = createPenCodec()
    const booleanNode: GraphNode = {
      id: 'bool',
      type: 'boolean',
      parentId: null,
      childIds: [],
      fields: { op: 'subtract' },
      passthrough: {}
    }
    const read = codec.read(codec.write(session({ nodes: [booleanNode], rootIds: ['bool'] })))

    expect(read.nodes[0]?.fields.op).toBe('subtract')
  })

  test('reads a session checkpoint without rewriting it', () => {
    const codec = createPenCodec()
    const checkpoint = session({
      nodes: [rectangle],
      rootIds: ['rect'],
      selection: ['rect'],
      tool: 'hand',
      comments: { thread: { nodeId: 'rect', body: 'Keep', resolved: true } }
    })

    expect(codec.read(checkpointToBytes(checkpoint))).toEqual(checkpoint)
  })

  test('reads an older .pen fixture', async () => {
    const bytes = new Uint8Array(
      await Bun.file(join(workspaceRoot(), 'tests/fixtures/pencil_simple.pen')).bytes()
    )
    const read = createPenCodec().read(bytes)
    const frame = read.nodes.find((node) => node.id === 'tMcTy')
    const table = read.nodes.find((node) => node.id === '8vM6Y')

    expect(read.version).toBe(1)
    expect(frame?.type).toBe('frame')
    expect(frame?.fields.name).toBe('Step 2 Frame')
    expect(frame?.fields.layout).toBe('vertical')
    expect(table?.fields.stroke).toMatchObject({ align: 'inside', fill: '$--border' })
    expect(read.variables?.['--background']).toMatchObject({ type: 'color' })
  })

  test('rejects a file that is neither checkpoint nor .pen document', () => {
    const codec = createPenCodec()
    const bytes = new TextEncoder().encode('{"version":1}')

    expect(() => codec.read(bytes)).toThrow(InvalidDocumentError)
  })
})

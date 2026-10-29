import { describe, expect, test } from 'bun:test'

import { componentHandlers, resolveLibrary } from '#engine/components'

import { createDocumentEngine, type DocumentStore } from '@open-pencil/engine'
import type { Command, GraphNode, JSONValue } from '@open-pencil/session'

const FAKE_FILE_NODES = 40

function open(name: string): DocumentStore {
  return createDocumentEngine({ name, id: name }, { handlers: componentHandlers })
}

function create(
  id: string,
  type: string,
  fields: Record<string, JSONValue>,
  options: {
    parentId?: string | null
    index?: number
    passthrough?: Record<string, JSONValue>
  } = {}
): Command {
  return {
    type: 'create',
    parentId: options.parentId ?? null,
    index: options.index ?? 0,
    node: {
      id,
      type,
      fields,
      ...(options.passthrough ? { passthrough: options.passthrough } : {})
    }
  }
}

describe('components, variables, and libraries', () => {
  test('reset-override clears descendant overrides in fields and passthrough as one undo step', () => {
    const document = open('overrides')
    document.apply(create('earlier', 'rectangle', { name: 'earlier', x: 1 }, { index: 0 }))
    document.apply(
      create(
        'use',
        'ref',
        { ref: 'button', name: 'Use', x: 2, descendants: { label: { content: 'Hi' } } },
        {
          index: 1,
          passthrough: { vendor: 'kept', descendants: { icon: { opacity: 0.4 } } }
        }
      )
    )
    document.apply(create('label', 'text', { content: 'Hi' }, { parentId: 'use', index: 0 }))
    document.apply({ type: 'edit', id: 'use', fields: { x: 5 } })

    const before = document.checkpoint().entries.length
    const result = document.apply({ type: 'reset-override', id: 'use' })
    const step = document.checkpoint().entries.at(-1)

    expect(result.ack.accepted).toBe(true)
    expect(document.checkpoint().entries.length).toBe(before + 1)
    expect(step?.forward).toHaveLength(1)
    expect(document.rootIds).toEqual(['earlier', 'use'])
    expect(document.getNode('use')?.childIds).toEqual(['label'])
    expect(document.getNode('use')?.fields).toEqual({ ref: 'button', name: 'Use', x: 5 })
    expect(document.getNode('use')?.passthrough).toEqual({ vendor: 'kept' })

    document.apply({ type: 'undo' })
    expect(document.getNode('use')?.fields.descendants).toEqual({ label: { content: 'Hi' } })
    expect(document.getNode('use')?.passthrough).toEqual({
      vendor: 'kept',
      descendants: { icon: { opacity: 0.4 } }
    })
    expect(document.getNode('use')?.fields.x).toBe(5)
    expect(document.getNode('use')?.childIds).toEqual(['label'])

    document.apply({ type: 'redo' })
    expect(document.getNode('use')?.fields.descendants).toBeUndefined()
    expect(document.getNode('use')?.passthrough).toEqual({ vendor: 'kept' })
    document.apply({ type: 'undo' })
    document.apply({ type: 'undo' })
    expect(document.getNode('use')?.fields.x).toBe(2)
  })

  test('reset-override leaves an instance with no descendant overrides out of history', () => {
    const document = open('plain')
    document.apply(create('use', 'ref', { ref: 'button' }))
    const before = document.checkpoint().entries.length
    const result = document.apply({ type: 'reset-override', id: 'use' })
    expect(result.ack.accepted).toBe(true)
    expect(document.checkpoint().entries.length).toBe(before)
    expect(document.getNode('use')?.fields).toEqual({ ref: 'button' })
  })

  test('reset-override reports a missing instance', () => {
    const document = open('missing-override')
    const result = document.apply({ type: 'reset-override', id: 'missing' })
    expect(result.ack.accepted).toBe(false)
    expect(result.ack.reason).toBe('missing-node')
    expect(document.checkpoint().entries).toHaveLength(0)
  })

  test('swap-variant writes the property record onto the instance as one undo step', () => {
    const document = open('variant')
    document.apply(create('use', 'ref', { ref: 'button', size: 'sm', name: 'Use' }))
    document.apply({ type: 'edit', id: 'use', fields: { name: 'Renamed' } })

    const before = document.checkpoint().entries.length
    const result = document.apply({
      type: 'swap-variant',
      id: 'use',
      properties: { size: 'lg', tone: 'dark' }
    })
    const step = document.checkpoint().entries.at(-1)

    expect(result.ack.accepted).toBe(true)
    expect(document.checkpoint().entries.length).toBe(before + 1)
    expect(step?.forward).toEqual([
      { kind: 'patch-fields', id: 'use', fields: { size: 'lg', tone: 'dark' } }
    ])
    expect(document.getNode('use')?.fields).toEqual({
      ref: 'button',
      size: 'lg',
      name: 'Renamed',
      tone: 'dark'
    })

    document.apply({ type: 'undo' })
    expect(document.getNode('use')?.fields).toEqual({
      ref: 'button',
      size: 'sm',
      name: 'Renamed'
    })
    document.apply({ type: 'redo' })
    expect(document.getNode('use')?.fields.tone).toBe('dark')
    expect(document.getNode('use')?.fields.size).toBe('lg')
  })

  test('swap-variant reports a missing instance', () => {
    const document = open('missing-variant')
    const result = document.apply({
      type: 'swap-variant',
      id: 'missing',
      properties: { size: 'lg' }
    })
    expect(result.ack.accepted).toBe(false)
    expect(result.ack.reason).toBe('missing-node')
  })

  test('resolveLibrary prefers a relative path and falls back to an absolute path', () => {
    expect(resolveLibrary({ relative: '../buttons.pen', absolute: '/abs/buttons.pen' })).toBe(
      '../buttons.pen'
    )
    expect(resolveLibrary({ absolute: '/abs/buttons.pen' })).toBe('/abs/buttons.pen')
    expect(resolveLibrary({ relative: '   ', absolute: '  /abs/buttons.pen  ' })).toBe(
      '/abs/buttons.pen'
    )
    expect(
      resolveLibrary({
        relative: 'https://example.com/buttons.pen',
        absolute: '/abs/buttons.pen'
      })
    ).toBe('/abs/buttons.pen')
    expect(
      resolveLibrary({
        relative: '//cdn.example.com/buttons.pen',
        absolute: '/abs/buttons.pen'
      })
    ).toBe('/abs/buttons.pen')
    expect(
      resolveLibrary({
        relative: 'https://example.com/a.pen',
        absolute: 'file:///tmp/a.pen'
      })
    ).toBeNull()
    expect(resolveLibrary({})).toBeNull()
    expect(resolveLibrary({ relative: 'C:\\libs\\buttons.pen' })).toBe('C:\\libs\\buttons.pen')
    expect(resolveLibrary({ absolute: '\\\\server\\share\\buttons.pen' })).toBe(
      '\\\\server\\share\\buttons.pen'
    )
  })

  test('import-library stores a relative path and resolution prefers that path', () => {
    const document = open('libraries')
    const result = document.apply({
      type: 'import-library',
      name: 'buttons',
      path: '../buttons.pen'
    })
    const stored = document.bag('libraries').buttons
    expect(result.ack.accepted).toBe(true)
    expect(stored).toBe('../buttons.pen')
    expect(resolveLibrary({ relative: storedPath(stored), absolute: '/abs/buttons.pen' })).toBe(
      '../buttons.pen'
    )
  })

  test('a variable edit touches one record and does not walk every node', () => {
    const document = createDocumentEngine(
      { name: 'fake', id: 'fake', bytes: fakeFile(FAKE_FILE_NODES) },
      { handlers: componentHandlers }
    )
    expect(document.nodes.size).toBe(FAKE_FILE_NODES)
    const before = document.getNode('n0')?.fields
    const watch = watchNodeWalks(document)
    try {
      expect(document.nodes).toBe(watch.nodes)
      const result = document.apply({
        type: 'set-variable',
        name: 'gap',
        value: 12,
        theme: { mode: 'dark' }
      })
      const during = watch.walks()
      void [...watch.nodes.values()]
      const afterProbe = watch.walks()
      expect(result.ack.accepted).toBe(true)
      expect(during).toBe(0)
      expect(afterProbe).toBe(1)
      expect(document.checkpoint().entries.at(-1)?.forward).toEqual([
        {
          kind: 'patch-bag',
          bag: 'variables',
          key: 'gap',
          value: { value: 12, theme: { mode: 'dark' } }
        }
      ])
    } finally {
      watch.restore()
    }
    expect(document.nodes.size).toBe(FAKE_FILE_NODES)
    expect(document.getNode('n0')?.fields).toEqual(before)
    expect(document.bag('variables')).toEqual({
      gap: { value: 12, theme: { mode: 'dark' } },
      color: { type: 'color', value: '#111111' }
    })
  })

  test('checkpoint round-trips a component, an instance ref, an override reset, and a theme value', () => {
    const document = open('round')
    document.apply(create('button', 'frame', { name: 'Button' }, { index: 0 }))
    document.apply({ type: 'create-component', id: 'button' })
    document.apply(
      create(
        'use',
        'ref',
        { ref: 'button', descendants: { label: { content: 'Old' } } },
        { index: 1 }
      )
    )
    document.apply({ type: 'reset-override', id: 'use' })
    document.apply({
      type: 'set-variable',
      name: 'accent',
      value: '#111111',
      theme: { mode: 'dark' }
    })

    const saved = document.checkpoint()
    const restored = open('restored')
    restored.restore(saved)

    expect(restored.checkpoint()).toEqual(saved)
    expect(restored.getNode('button')?.fields.reusable).toBe(true)
    expect(restored.getNode('use')?.fields.ref).toBe('button')
    expect(restored.getNode('use')?.fields.descendants).toBeUndefined()
    expect(restored.bag('variables').accent).toEqual({
      value: '#111111',
      theme: { mode: 'dark' }
    })

    restored.apply({ type: 'undo' })
    expect(restored.bag('variables').accent).toBeUndefined()
    expect(restored.getNode('button')?.fields.reusable).toBe(true)
    expect(restored.getNode('use')?.fields.descendants).toBeUndefined()
    restored.apply({ type: 'undo' })
    expect(restored.getNode('use')?.fields).toEqual({
      ref: 'button',
      descendants: { label: { content: 'Old' } }
    })
  })
})

function storedPath(value: JSONValue | undefined): string {
  if (typeof value !== 'string') throw new Error('Library import did not store a path')
  return value
}

function fakeFile(count: number): Uint8Array {
  const children: Record<string, JSONValue>[] = []
  for (let index = 0; index < count; index += 1) {
    children.push({
      id: `n${index}`,
      type: 'rectangle',
      x: index,
      y: 0,
      width: 8,
      height: 8
    })
  }
  const document = {
    version: '2.21',
    variables: {
      gap: { type: 'number', value: 4 },
      color: { type: 'color', value: '#111111' }
    },
    children
  }
  return new TextEncoder().encode(JSON.stringify(document))
}

/** Counts iteration and lookup of the document node map while a command runs. */
class CountingMap<K, V> extends Map<K, V> {
  walks = 0

  override get(key: K): V | undefined {
    this.walks += 1
    return super.get(key)
  }

  override keys(): MapIterator<K> {
    this.walks += 1
    return super.keys()
  }

  override values(): MapIterator<V> {
    this.walks += 1
    return super.values()
  }

  override entries(): MapIterator<[K, V]> {
    this.walks += 1
    return super.entries()
  }

  override forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void): void {
    this.walks += 1
    super.forEach(callbackfn)
  }

  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.walks += 1
    return super[Symbol.iterator]()
  }
}

function watchNodeWalks(document: DocumentStore): {
  nodes: CountingMap<string, GraphNode>
  walks: () => number
  restore: () => void
} {
  const previous = document.nodes
  const nodes = new CountingMap(previous)
  Object.assign(document, { nodes })
  return {
    nodes,
    walks: () => nodes.walks,
    restore() {
      Object.assign(document, { nodes: previous })
    }
  }
}

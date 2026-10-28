import { describe, expect, test } from 'bun:test'

import {
  applyRemote,
  openCollab,
  peerSettings,
  readCommentThread,
  voiceState,
  type CollabSession
} from '#engine/collab'

import { createDocumentEngine, createPenCodec } from '@open-pencil/engine'
import type { JSONValue, NodeDraft } from '@open-pencil/session'

function open(name: string): CollabSession {
  return openCollab(createDocumentEngine({ name, id: name }))
}

function exchange(left: CollabSession, right: CollabSession): void {
  const fromLeft = left.encodeUpdate()
  const fromRight = right.encodeUpdate()
  right.applyForwarded(fromLeft)
  left.applyForwarded(fromRight)
}

function rectangle(id: string, fields: Record<string, JSONValue> = {}): NodeDraft {
  return { id, type: 'rectangle', fields }
}

function reply(
  session: CollabSession,
  id: string,
  body: string,
  author: string,
  createdAt: string
): void {
  session.addReply('thread', { id, body, author, createdAt })
}

describe('collaboration', () => {
  test('applyRemote creates, writes fields, and moves through document commands', () => {
    const store = createDocumentEngine({ name: 'remote', id: 'remote' })
    applyRemote(store, {
      kind: 'create',
      parentId: null,
      index: 0,
      node: { id: 'frame', type: 'frame', fields: {} }
    })
    applyRemote(store, {
      kind: 'create',
      parentId: 'frame',
      index: 0,
      node: { id: 'rect', type: 'rectangle', fields: { x: 1 } }
    })
    applyRemote(store, { kind: 'fields', id: 'rect', fields: { x: 4 } })
    applyRemote(store, { kind: 'move', id: 'rect', parentId: null, index: 1 })

    expect(store.getNode('rect')?.fields.x).toBe(4)
    expect(store.rootIds).toEqual(['frame', 'rect'])
    store.apply({ type: 'undo' })
    expect(store.getNode('rect')?.parentId).toBe('frame')
    expect(store.getNode('rect')?.fields.x).toBe(4)
    store.apply({ type: 'undo' })
    expect(store.getNode('rect')?.fields.x).toBe(1)
  })

  test('a create on A appears on B after the room window forwards the bytes', () => {
    const left = open('left')
    const right = open('right')
    left.create(rectangle('rect', { name: 'rect', x: 2 }), null, 0)
    exchange(left, right)

    expect(right.store.getNode('rect')?.type).toBe('rectangle')
    expect(right.store.getNode('rect')?.fields).toEqual({ name: 'rect', x: 2 })
    expect(right.store.rootIds).toEqual(['rect'])
    expect(left.store.rootIds).toEqual(['rect'])
  })

  test('undo on A is a local document command', () => {
    const left = open('undo-a')
    const right = open('undo-b')
    left.create(rectangle('rect', { x: 2 }), null, 0)
    exchange(left, right)

    const undone = left.store.apply({ type: 'undo' })
    expect(undone.ack.accepted).toBe(true)
    expect(left.store.getNode('rect')).toBeUndefined()
    expect(right.store.getNode('rect')?.fields.x).toBe(2)
  })

  test('fields are last-write per field and map fields merge per entry', () => {
    const left = open('fields-a')
    const right = open('fields-b')
    left.create(rectangle('rect', { x: 0, y: 0 }), null, 0)
    exchange(left, right)

    left.edit('rect', { x: 4 })
    right.edit('rect', { y: 9 })
    exchange(left, right)
    expect(left.store.getNode('rect')?.fields.x).toBe(4)
    expect(left.store.getNode('rect')?.fields.y).toBe(9)
    expect(right.store.getNode('rect')?.fields.x).toBe(4)
    expect(right.store.getNode('rect')?.fields.y).toBe(9)

    left.edit('rect', { x: 1 })
    exchange(left, right)
    right.edit('rect', { x: 8 })
    exchange(left, right)
    expect(left.store.getNode('rect')?.fields.x).toBe(8)
    expect(right.store.getNode('rect')?.fields.x).toBe(8)

    left.edit('rect', { valuesByMode: { light: 1 } })
    exchange(left, right)
    left.edit('rect', { valuesByMode: { shared: 'from-left' } })
    right.edit('rect', { valuesByMode: { dark: 2, shared: 'from-right' } })
    exchange(left, right)
    const modes = left.store.getNode('rect')?.fields.valuesByMode
    expect(modes).toEqual(right.store.getNode('rect')?.fields.valuesByMode)
    expect(modes).toMatchObject({ light: 1, dark: 2 })
    const shared =
      modes && typeof modes === 'object' && !Array.isArray(modes) ? modes.shared : undefined
    expect(shared === 'from-left' || shared === 'from-right').toBe(true)
  })

  test('text content is last-write as one field', () => {
    const left = open('text-a')
    const right = open('text-b')
    left.create({ id: 'label', type: 'text', fields: { content: '' } }, null, 0)
    exchange(left, right)

    left.edit('label', { content: 'Hello' })
    right.edit('label', { content: 'World' })
    exchange(left, right)
    const concurrent = left.store.getNode('label')?.fields.content
    expect(concurrent).toBe(right.store.getNode('label')?.fields.content)
    expect(concurrent === 'Hello' || concurrent === 'World').toBe(true)

    left.edit('label', { content: 'Hello' })
    exchange(left, right)
    right.edit('label', { content: 'World' })
    exchange(left, right)
    expect(left.store.getNode('label')?.fields.content).toBe('World')
    expect(right.store.getNode('label')?.fields.content).toBe('World')
  })

  test('moves agree on a Lamport clock and fractional sibling order', () => {
    const left = open('tree-a')
    const right = open('tree-b')
    left.create({ id: 'frame', type: 'frame', fields: { name: 'frame' } }, null, 0)
    left.create(rectangle('a'), 'frame', 0)
    left.create(rectangle('b'), 'frame', 1)
    exchange(left, right)
    expect(right.store.getNode('frame')?.childIds).toEqual(['a', 'b'])

    left.move('b', 'frame', 0)
    exchange(left, right)
    expect(left.store.getNode('frame')?.childIds).toEqual(['b', 'a'])
    expect(right.store.getNode('frame')?.childIds).toEqual(['b', 'a'])

    left.create({ id: 'frame-a', type: 'frame', fields: {} }, null, 0)
    left.create({ id: 'frame-b', type: 'frame', fields: {} }, null, 1)
    left.create(rectangle('item'), null, 2)
    exchange(left, right)
    left.move('item', 'frame-b', 0)
    exchange(left, right)
    right.move('item', 'frame-a', 0)
    exchange(left, right)
    expect(left.store.getNode('item')?.parentId).toBe('frame-a')
    expect(right.store.getNode('item')?.parentId).toBe('frame-a')

    const againLeft = open('tie-a')
    const againRight = open('tie-b')
    againLeft.create({ id: 'frame-a', type: 'frame', fields: {} }, null, 0)
    againLeft.create({ id: 'frame-b', type: 'frame', fields: {} }, null, 1)
    againLeft.create(rectangle('item'), null, 2)
    exchange(againLeft, againRight)
    againLeft.move('item', 'frame-a', 0)
    againRight.move('item', 'frame-b', 0)
    exchange(againLeft, againRight)
    expect(againLeft.store.getNode('item')?.parentId).toBe('frame-b')
    expect(againRight.store.getNode('item')?.parentId).toBe('frame-b')

    const orderLeft = open('order-a')
    const orderRight = open('order-b')
    orderLeft.create({ id: 'frame', type: 'frame', fields: {} }, null, 0)
    orderLeft.create(rectangle('keep'), 'frame', 0)
    exchange(orderLeft, orderRight)
    orderLeft.create(rectangle('n-a'), 'frame', 0)
    orderRight.create(rectangle('n-b'), 'frame', 0)
    exchange(orderLeft, orderRight)
    const children = orderLeft.store.getNode('frame')?.childIds ?? []
    const otherChildren = orderRight.store.getNode('frame')?.childIds ?? []
    expect(children).toEqual(otherChildren)
    expect(children.at(-1)).toBe('keep')
    expect(children).toHaveLength(3)
    expect(children.includes('n-a')).toBe(true)
    expect(children.includes('n-b')).toBe(true)
  })

  test('comment replies merge per reply id', () => {
    const left = open('comments-a')
    const right = open('comments-b')
    left.writeThread('thread', { nodeId: 'rect', body: 'Question', resolved: false })
    exchange(left, right)
    reply(left, 'one', 'From A', 'a', '2026-10-28T00:00:00.000Z')
    reply(right, 'two', 'From B', 'b', '2026-10-28T00:00:01.000Z')
    reply(left, 'same', 'alpha', 'a', '2026-10-28T00:00:02.000Z')
    reply(right, 'same', 'beta', 'b', '2026-10-28T00:00:03.000Z')
    exchange(left, right)

    const thread = readCommentThread(left.store.bag('comments').thread)
    const other = readCommentThread(right.store.bag('comments').thread)
    expect(thread?.replies.one?.body).toBe('From A')
    expect(thread?.replies.two?.body).toBe('From B')
    expect(other?.replies.one?.body).toBe('From A')
    expect(other?.replies.two?.body).toBe('From B')
    const body = thread?.replies.same?.body
    expect(body).toBe(other?.replies.same?.body)
    expect(body === 'alpha' || body === 'beta').toBe(true)
  })

  test('a merged comment thread survives a .pen reload', () => {
    const left = open('pen-a')
    const right = open('pen-b')
    left.writeThread('thread', { nodeId: 'rect', body: 'Question', resolved: false })
    exchange(left, right)
    reply(left, 'one', 'From A', 'a', '2026-10-28T00:00:00.000Z')
    reply(right, 'two', 'From B', 'b', '2026-10-28T00:00:01.000Z')
    exchange(left, right)

    const bytes = createPenCodec().write(left.store.checkpoint())
    const loaded = createDocumentEngine({ name: 'reloaded', id: 'reloaded', bytes })
    const stored = readCommentThread(loaded.bag('comments').thread)
    expect(stored?.body).toBe('Question')
    expect(stored?.resolved).toBe(false)
    expect(stored?.replies.one?.body).toBe('From A')
    expect(stored?.replies.two?.body).toBe('From B')
  })

  test('voiceState reports who is in the call, muted, and speaking', () => {
    expect(
      voiceState([
        { id: 'ada', call: { muted: false, speaking: true } },
        { id: 'bea', call: { muted: true, speaking: false } },
        { id: 'cy', call: null }
      ])
    ).toEqual([
      { id: 'ada', muted: false, speaking: true },
      { id: 'bea', muted: true, speaking: false }
    ])
  })

  test('peer settings keep broker and ICE defaults until overridden', () => {
    const defaults = peerSettings()
    expect(defaults.brokers).toEqual([
      'wss://broker.emqx.io:8084/mqtt',
      'wss://public:public@public.cloud.shiftr.io',
      'wss://broker.hivemq.com:8884/mqtt',
      'wss://test.mosquitto.org:8081/mqtt'
    ])
    expect(defaults.iceServers.map((server) => server.urls)).toEqual([
      'stun:stun.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp'
    ])

    const brokers = peerSettings({ brokers: ['wss://broker.example/mqtt'] })
    expect(brokers.brokers).toEqual(['wss://broker.example/mqtt'])
    expect(brokers.iceServers).toEqual(defaults.iceServers)

    const ice = peerSettings({ iceServers: [{ urls: 'stun:stun.example:3478' }] })
    expect(ice.iceServers).toEqual([{ urls: 'stun:stun.example:3478' }])
    expect(ice.brokers).toEqual(defaults.brokers)
  })
})

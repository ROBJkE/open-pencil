import { describe, expect, test } from 'bun:test'

import {
  runAgent,
  type AgentEvent,
  type AgentMessage,
  type AgentModel,
  type ModelChunk,
  type SideSceneEvent
} from '#host/agent'

import { createDocumentEngine, type DocumentStore } from '@open-pencil/engine'

const request: AgentMessage = { role: 'user', content: 'Add a card and a title.' }

interface FixtureNode {
  id: string
  type: string
  fields: { name: string }
  children?: FixtureNode[]
}

interface Fixture {
  nodes: FixtureNode[]
}

const card: Fixture = {
  nodes: [
    {
      id: 'card',
      type: 'frame',
      fields: { name: 'Card' },
      children: [{ id: 'label', type: 'text', fields: { name: 'Label' } }]
    }
  ]
}

const title: Fixture = {
  nodes: [{ id: 'title', type: 'rectangle', fields: { name: 'Title' } }]
}

function createPage(): DocumentStore {
  const document = createDocumentEngine({ name: 'Agent', id: 'agent' })
  const created = document.apply({
    type: 'create',
    parentId: null,
    index: 0,
    node: { id: 'page', type: 'frame', fields: { name: 'Page' } }
  })
  expect(created.ack.accepted).toBe(true)
  return document
}

async function* renderStream(id: string, input: Fixture): AsyncGenerator<ModelChunk> {
  yield { type: 'tool-input-start', id, name: 'render' }
  yield { type: 'tool-input-delta', id, delta: JSON.stringify(input) }
  yield { type: 'tool-call', id, name: 'render', input }
}

async function collect(
  model: AgentModel,
  document: DocumentStore,
  onScene?: (event: SideSceneEvent) => void,
  signal?: AbortSignal
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const event of runAgent(model, [request], { document, signal, onScene })) {
    events.push(event)
  }
  return events
}

describe('agent', () => {
  test('a streamed render tool call commits as one undo step', async () => {
    const document = createPage()
    const before = document.checkpoint().entries.length
    const scene: SideSceneEvent[] = []
    const model: AgentModel = async function* model() {
      yield { type: 'text-delta', id: 'text-1', delta: 'Drawing a card.' }
      yield* renderStream('render-1', card)
      yield* renderStream('render-2', title)
      yield { type: 'finish', reason: 'stop' }
    }

    const events = await collect(model, document, (event) => {
      scene.push(event)
    })

    expect(scene).toEqual([
      { type: 'start', callId: 'render-1' },
      { type: 'delta', callId: 'render-1', text: JSON.stringify(card) },
      { type: 'finish', callId: 'render-1' },
      { type: 'start', callId: 'render-2' },
      { type: 'delta', callId: 'render-2', text: JSON.stringify(title) },
      { type: 'finish', callId: 'render-2' },
      { type: 'clear' }
    ])
    expect(events).toEqual([
      { type: 'text-delta', id: 'text-1', delta: 'Drawing a card.' },
      { type: 'tool-call', id: 'render-1', name: 'render', input: card },
      { type: 'tool-result', id: 'render-1', name: 'render', output: { ids: ['card', 'label'] } },
      { type: 'tool-call', id: 'render-2', name: 'render', input: title },
      { type: 'tool-result', id: 'render-2', name: 'render', output: { ids: ['title'] } },
      { type: 'finish' }
    ])
    expect(document.rootIds).toEqual(['page', 'card', 'title'])
    expect(document.getNode('card')?.childIds).toEqual(['label'])
    expect(document.getNode('label')?.fields.name).toBe('Label')
    expect(document.getNode('title')?.fields.name).toBe('Title')
    expect(document.checkpoint().entries).toHaveLength(before + 1)
    expect(
      document
        .checkpoint()
        .entries.at(-1)
        ?.forward.flatMap((operation) => (operation.kind === 'put-node' ? [operation.node.id] : []))
    ).toEqual(['card', 'label', 'title'])

    document.apply({ type: 'undo' })
    expect(document.rootIds).toEqual(['page'])
    expect(document.getNode('card')).toBeUndefined()
    expect(document.getNode('label')).toBeUndefined()
    expect(document.getNode('title')).toBeUndefined()
    expect(document.checkpoint().undone).toBe(1)
  })

  test('abort discards the side scene and commits nothing', async () => {
    const document = createPage()
    const before = document.checkpoint().entries.length
    const controller = new AbortController()
    const scene: SideSceneEvent[] = []
    const model: AgentModel = async function* model() {
      yield* renderStream('render-1', card)
      yield { type: 'finish', reason: 'stop' }
    }

    const events = await collect(
      model,
      document,
      (event) => {
        scene.push(event)
        if (event.type === 'delta') controller.abort()
      },
      controller.signal
    )

    expect(scene).toEqual([
      { type: 'start', callId: 'render-1' },
      { type: 'delta', callId: 'render-1', text: JSON.stringify(card) },
      { type: 'clear' }
    ])
    expect(events).toEqual([{ type: 'abort' }])
    expect(document.checkpoint().entries).toHaveLength(before)
    expect(document.rootIds).toEqual(['page'])
    expect(document.getNode('card')).toBeUndefined()
  })

  test('an error discards a staged render and commits nothing', async () => {
    const document = createPage()
    const before = document.checkpoint().entries.length
    const scene: SideSceneEvent[] = []
    const model: AgentModel = async function* model() {
      yield* renderStream('render-1', card)
      yield { type: 'error', message: 'The provider closed the stream.' }
    }

    const events = await collect(model, document, (event) => {
      scene.push(event)
    })

    expect(scene).toEqual([
      { type: 'start', callId: 'render-1' },
      { type: 'delta', callId: 'render-1', text: JSON.stringify(card) },
      { type: 'finish', callId: 'render-1' },
      { type: 'clear' }
    ])
    expect(events).toEqual([
      { type: 'tool-call', id: 'render-1', name: 'render', input: card },
      { type: 'tool-result', id: 'render-1', name: 'render', output: { ids: ['card', 'label'] } },
      { type: 'error', message: 'The provider closed the stream.' }
    ])
    expect(document.checkpoint().entries).toHaveLength(before)
    expect(document.getNode('card')).toBeUndefined()
    expect(document.getNode('label')).toBeUndefined()
  })

  test('sends tool results back to the model before the one commit', async () => {
    const document = createPage()
    const before = document.checkpoint().entries.length
    const seen: AgentMessage[][] = []
    const flat: Fixture = { nodes: [{ id: 'card', type: 'frame', fields: { name: 'Card' } }] }
    const model: AgentModel = async function* model(messages) {
      seen.push([...messages])
      if (seen.length === 1) {
        yield* renderStream('render-1', flat)
        yield { type: 'finish', reason: 'tool-calls' }
        return
      }
      yield { type: 'text-delta', id: 'text-2', delta: 'Done.' }
      yield { type: 'finish', reason: 'stop' }
    }

    const events = await collect(model, document)

    expect(seen[1]).toEqual([
      request,
      {
        role: 'tool',
        content: '{"ids":["card"]}',
        toolCallId: 'render-1',
        name: 'render'
      }
    ])
    expect(events).toEqual([
      { type: 'tool-call', id: 'render-1', name: 'render', input: flat },
      { type: 'tool-result', id: 'render-1', name: 'render', output: { ids: ['card'] } },
      { type: 'text-delta', id: 'text-2', delta: 'Done.' },
      { type: 'finish' }
    ])
    expect(document.checkpoint().entries).toHaveLength(before + 1)
    document.apply({ type: 'undo' })
    expect(document.getNode('card')).toBeUndefined()
    expect(document.getNode('page')?.fields.name).toBe('Page')
  })
})

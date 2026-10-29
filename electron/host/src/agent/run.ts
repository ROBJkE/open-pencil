import type { DocumentStore } from '@open-pencil/engine'

import { commitRenderBatch } from './batch'
import type {
  AgentEvent,
  AgentMessage,
  AgentModel,
  AgentToolOutput,
  ModelChunk,
  SideSceneEvent
} from './events'
import { readStagedRender, RENDER_TOOL, type StagedRender } from './render'
import { createSideScene, type SideScene } from './scene'

const MAX_AGENT_STEPS = 8

export interface RunAgentOptions {
  document: DocumentStore
  signal?: AbortSignal
  /** Canvas preview. The chat UI does not read this; it reads `AgentEvent`s. */
  onScene?: (event: SideSceneEvent) => void
}

interface OpenCall {
  name: string
}

interface RunState {
  scene: SideScene
  document: DocumentStore
  staged: StagedRender[]
  used: Set<string>
  open: Map<string, OpenCall>
}

interface StepContext extends RunState {
  text: string[]
  tools: AgentMessage[]
}

interface ChunkEffect {
  events: readonly AgentEvent[]
  halt?: 'stop' | 'tool-calls' | 'error'
  message?: string
}

type StepResult =
  | { kind: 'stop' }
  | { kind: 'abort' }
  | { kind: 'error'; message: string }
  | { kind: 'continue'; messages: AgentMessage[] }

type ToolCallChunk = Extract<ModelChunk, { type: 'tool-call' }>

/**
 * Runs one reply. `model` is invoked per step and is the only provider
 * boundary, so a fake async generator stands in for the Vercel AI SDK.
 * Render calls stay on the side scene until the model stops, then land as
 * one undo step. Abort and error discard that scene and commit nothing.
 */
export async function* runAgent(
  model: AgentModel,
  messages: readonly AgentMessage[],
  options: RunAgentOptions
): AsyncGenerator<AgentEvent> {
  const signal = options.signal ?? new AbortController().signal
  const scene = createSideScene((event) => {
    options.onScene?.(event)
  })
  const run: RunState = {
    scene,
    document: options.document,
    staged: [],
    used: new Set<string>(),
    open: new Map<string, OpenCall>()
  }
  const settled = { done: false }
  let history: AgentMessage[] = [...messages]
  try {
    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      if (signal.aborted) {
        yield terminal(scene, settled, { type: 'abort' })
        return
      }
      const result = yield* runStep(model, history, signal, run)
      if (result.kind === 'abort') {
        yield terminal(scene, settled, { type: 'abort' })
        return
      }
      if (result.kind === 'error') {
        yield terminal(scene, settled, { type: 'error', message: stated(result.message) })
        return
      }
      if (result.kind === 'continue') {
        history = result.messages
        continue
      }
      if (!commitRenderBatch(run.document, run.staged)) {
        yield terminal(scene, settled, {
          type: 'error',
          message: 'The render could not be committed.'
        })
        return
      }
      yield terminal(scene, settled, { type: 'finish' })
      return
    }
    yield terminal(scene, settled, {
      type: 'error',
      message: 'The agent exceeded its step limit.'
    })
  } finally {
    if (!settled.done) scene.discard()
  }
}

function terminal(scene: SideScene, settled: { done: boolean }, event: AgentEvent): AgentEvent {
  scene.discard()
  settled.done = true
  return event
}

function stated(message: string): string {
  return message.length > 0 ? message : 'The agent failed.'
}

async function* runStep(
  model: AgentModel,
  history: readonly AgentMessage[],
  signal: AbortSignal,
  run: RunState
): AsyncGenerator<AgentEvent, StepResult> {
  const ctx: StepContext = { ...run, text: [], tools: [] }
  let reason: 'stop' | 'tool-calls' | null = null
  let failure: string | null = null
  try {
    for await (const chunk of model(history, signal)) {
      if (signal.aborted) return { kind: 'abort' }
      const effect = reduceChunk(chunk, ctx)
      for (const event of effect.events) yield event
      if (effect.halt === 'error') {
        failure = effect.message ?? ''
        break
      }
      if (effect.halt === 'stop' || effect.halt === 'tool-calls') {
        reason = effect.halt
        break
      }
    }
  } catch (error: unknown) {
    if (signal.aborted || isAbortError(error)) return { kind: 'abort' }
    return { kind: 'error', message: thrownMessage(error) }
  }
  if (signal.aborted) return { kind: 'abort' }
  if (failure !== null) return { kind: 'error', message: failure }
  if (reason === 'tool-calls' && ctx.tools.length > 0) {
    return { kind: 'continue', messages: nextMessages(history, ctx.text, ctx.tools) }
  }
  return { kind: 'stop' }
}

function nextMessages(
  history: readonly AgentMessage[],
  text: readonly string[],
  tools: readonly AgentMessage[]
): AgentMessage[] {
  const content = text.join('')
  const assistant: AgentMessage[] = content.length > 0 ? [{ role: 'assistant', content }] : []
  return [...history, ...assistant, ...tools]
}

function reduceChunk(chunk: ModelChunk, ctx: StepContext): ChunkEffect {
  switch (chunk.type) {
    case 'text-delta':
      return onText(chunk, ctx)
    case 'tool-input-start':
      return onToolStart(chunk, ctx)
    case 'tool-input-delta':
      return onToolDelta(chunk, ctx)
    case 'tool-call':
      return onToolCall(chunk, ctx)
    case 'finish':
      return { events: [], halt: chunk.reason }
    case 'error':
      return { events: [], halt: 'error', message: chunk.message }
  }
  return { events: [] }
}

function onText(chunk: Extract<ModelChunk, { type: 'text-delta' }>, ctx: StepContext): ChunkEffect {
  if (chunk.delta.length === 0) return { events: [] }
  ctx.text.push(chunk.delta)
  return { events: [{ type: 'text-delta', id: chunk.id, delta: chunk.delta }] }
}

function onToolStart(
  chunk: Extract<ModelChunk, { type: 'tool-input-start' }>,
  ctx: StepContext
): ChunkEffect {
  ctx.open.set(chunk.id, { name: chunk.name })
  if (chunk.name === RENDER_TOOL) ctx.scene.start(chunk.id)
  return { events: [] }
}

function onToolDelta(
  chunk: Extract<ModelChunk, { type: 'tool-input-delta' }>,
  ctx: StepContext
): ChunkEffect {
  const call = ctx.open.get(chunk.id)
  if (!call || chunk.delta.length === 0) return { events: [] }
  if (call.name === RENDER_TOOL) ctx.scene.delta(chunk.id, chunk.delta)
  return { events: [] }
}

function onToolCall(chunk: ToolCallChunk, ctx: StepContext): ChunkEffect {
  const output = chunk.name === RENDER_TOOL ? acceptRender(chunk, ctx) : unknownTool(chunk.name)
  ctx.tools.push({
    role: 'tool',
    content: JSON.stringify(output),
    toolCallId: chunk.id,
    name: chunk.name
  })
  return {
    events: [
      { type: 'tool-call', id: chunk.id, name: chunk.name, input: chunk.input },
      { type: 'tool-result', id: chunk.id, name: chunk.name, output }
    ]
  }
}

function acceptRender(chunk: ToolCallChunk, ctx: StepContext): AgentToolOutput {
  const parsed = readStagedRender(chunk.input)
  if (!parsed) return { error: 'The render input is not a document fragment.' }
  const refusal = refusalFor(parsed, ctx)
  if (refusal) return refusal
  for (const node of parsed.nodes) ctx.used.add(node.id)
  ctx.staged.push(parsed)
  if (!ctx.open.has(chunk.id)) {
    ctx.open.set(chunk.id, { name: RENDER_TOOL })
    ctx.scene.start(chunk.id)
  }
  ctx.scene.finish(chunk.id)
  return { ids: parsed.nodes.map((node) => node.id) }
}

function refusalFor(render: StagedRender, ctx: StepContext): AgentToolOutput | null {
  if (!parentAvailable(render.parentId, ctx)) return { error: 'The render parent is missing.' }
  if (
    render.nodes.some(
      (node) => ctx.used.has(node.id) || ctx.document.getNode(node.id) !== undefined
    )
  ) {
    return { error: 'The render repeats a node id.' }
  }
  return null
}

function parentAvailable(parentId: string | null, ctx: StepContext): boolean {
  if (parentId === null) return true
  return ctx.document.getNode(parentId) !== undefined || ctx.used.has(parentId)
}

function unknownTool(name: string): AgentToolOutput {
  return { error: `Unknown tool: ${name}.` }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function thrownMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message
  return 'The agent failed.'
}

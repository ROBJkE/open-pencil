/**
 * What the chat UI reads. Provider chunks stay behind `AgentModel`; a Vercel
 * AI SDK client maps its stream onto those chunks, and tests yield them.
 */

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'tool'; content: string; toolCallId: string; name: string }

export type AgentToolOutput = { ids: string[] } | { error: string }

export type AgentEvent =
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | { type: 'tool-result'; id: string; name: string; output: AgentToolOutput }
  | { type: 'finish' }
  | { type: 'error'; message: string }
  | { type: 'abort' }

/** Canvas preview for one `render` call. `clear` drops every call. */
export type SideSceneEvent =
  | { type: 'start'; callId: string }
  | { type: 'delta'; callId: string; text: string }
  | { type: 'finish'; callId: string }
  | { type: 'clear' }

export type ModelChunk =
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'tool-input-start'; id: string; name: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | { type: 'finish'; reason: 'stop' | 'tool-calls' }
  | { type: 'error'; message: string }

export type AgentModel = (
  messages: readonly AgentMessage[],
  signal: AbortSignal
) => AsyncGenerator<ModelChunk>

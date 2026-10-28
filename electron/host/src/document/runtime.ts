import { createDocumentProcessHost } from './host'
import {
  encodeDocumentFrame,
  encodeDocumentMessage,
  parseDocumentRequest,
  type DocumentResult,
  type DocumentTilePacket
} from './protocol'

export type DocumentPacket = { type: 'text'; text: string } | DocumentTilePacket

/** A document utility process, or a stand-in the tests can kill without a display. */
export interface DocumentRuntime {
  send(message: string): void
  onMessage(listener: (packet: DocumentPacket) => void): () => void
  onExit(listener: (code: number | null) => void): () => void
  kill(): void
}

export interface DocumentRuntimeFactory {
  spawn(): DocumentRuntime
}

function failureReply(message: string): string | null {
  const parsed = parseDocumentRequest(message)
  if (!parsed.success) return null
  return encodeDocumentMessage({
    type: 'result',
    requestId: parsed.output.requestId,
    ok: false,
    reason: 'document process failed'
  } satisfies DocumentResult)
}

/**
 * Runs the document host in this process. Each spawn builds a new host, so two
 * documents do not share an engine. Killing it fires exit the way a utility
 * process does.
 */
export function createLocalDocumentRuntime(): DocumentRuntime {
  const messages = new Set<(packet: DocumentPacket) => void>()
  const exits = new Set<(code: number | null) => void>()
  let killed = false

  function deliver(packet: DocumentPacket): void {
    for (const listener of messages) listener(packet)
  }

  const host = createDocumentProcessHost({
    frame(update) {
      deliver({ type: 'text', text: encodeDocumentFrame(update) })
    },
    tile(packet) {
      deliver(packet)
    }
  })

  return {
    send(message) {
      if (killed) {
        const failure = failureReply(message)
        if (failure) deliver({ type: 'text', text: failure })
        return
      }
      let replies: string[]
      try {
        replies = host.handle(message)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'document process failed'
        const parsed = parseDocumentRequest(message)
        const requestId = parsed.success ? parsed.output.requestId : ''
        replies = [encodeDocumentMessage({ type: 'result', requestId, ok: false, reason })]
      }
      for (const reply of replies) deliver({ type: 'text', text: reply })
    },
    onMessage(listener) {
      messages.add(listener)
      return () => {
        messages.delete(listener)
      }
    },
    onExit(listener) {
      exits.add(listener)
      return () => {
        exits.delete(listener)
      }
    },
    kill() {
      if (killed) return
      killed = true
      host.dispose()
      for (const listener of exits) listener(null)
    }
  }
}

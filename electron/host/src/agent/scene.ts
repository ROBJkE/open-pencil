import type { SideSceneEvent } from './events'

interface LiveCall {
  finished: boolean
}

export interface SideScene {
  start(callId: string): void
  delta(callId: string, text: string): void
  finish(callId: string): void
  /** Drops every call. A second discard emits nothing. */
  discard(): void
}

/**
 * Lifetime of streamed `render` input. This does not write the document:
 * finish only means the call's preview is complete.
 */
export function createSideScene(emit: (event: SideSceneEvent) => void): SideScene {
  const calls = new Map<string, LiveCall>()
  let shown = false

  return {
    start(callId) {
      calls.set(callId, { finished: false })
      shown = true
      emit({ type: 'start', callId })
    },
    delta(callId, text) {
      const call = calls.get(callId)
      if (!call || call.finished || text.length === 0) return
      emit({ type: 'delta', callId, text })
    },
    finish(callId) {
      const call = calls.get(callId)
      if (!call || call.finished) return
      call.finished = true
      emit({ type: 'finish', callId })
    },
    discard() {
      calls.clear()
      if (!shown) return
      shown = false
      emit({ type: 'clear' })
    }
  }
}

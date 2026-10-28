import { createDocumentEngine, createPenCodec } from '@open-pencil/engine'
import type { DocumentEngine } from '@open-pencil/session'

import {
  decodeBytes,
  encodeBytes,
  encodeDocumentMessage,
  parseDocumentRequest,
  type DocumentRequest,
  type DocumentResult
} from './protocol'

interface EngineHolder {
  engine: DocumentEngine | null
}

function failed(requestId: string, reason: string): DocumentResult {
  return { type: 'result', requestId, ok: false, reason }
}

function succeeded(
  requestId: string,
  extra: Omit<DocumentResult, 'type' | 'requestId' | 'ok'>
): DocumentResult {
  return { type: 'result', requestId, ok: true, ...extra }
}

/**
 * One document engine. The utility process and the in-process test runtime
 * both drive this, so each open document has its own engine object.
 */
export function createDocumentProcessHost() {
  const codec = createPenCodec()
  const holder: EngineHolder = { engine: null }

  function dispatch(request: DocumentRequest): DocumentResult {
    switch (request.type) {
      case 'open': {
        holder.engine?.dispose()
        let bytes: Uint8Array | undefined
        if (request.bytes !== undefined) {
          const decoded = decodeBytes(request.bytes)
          if (!decoded) return failed(request.requestId, 'invalid-bytes')
          bytes = decoded
        }
        const engine = createDocumentEngine({ ...request.spec, bytes }, { codec })
        holder.engine = engine
        return succeeded(request.requestId, {
          documentId: engine.id,
          checkpoint: engine.checkpoint()
        })
      }
      case 'apply': {
        const engine = holder.engine
        if (!engine) return failed(request.requestId, 'missing-document')
        const result = engine.apply(request.command)
        return succeeded(request.requestId, {
          apply: { ack: result.ack, events: result.events },
          checkpoint: engine.checkpoint()
        })
      }
      case 'layer-tree': {
        const engine = holder.engine
        if (!engine) return failed(request.requestId, 'missing-document')
        return succeeded(request.requestId, { layerTree: engine.readLayerTree(request.query) })
      }
      case 'selection': {
        const engine = holder.engine
        if (!engine) return failed(request.requestId, 'missing-document')
        return succeeded(request.requestId, { selection: engine.readSelection() })
      }
      case 'viewport': {
        const engine = holder.engine
        if (!engine) return failed(request.requestId, 'missing-document')
        return succeeded(request.requestId, { viewport: engine.readViewport() })
      }
      case 'restore': {
        const engine = holder.engine
        if (!engine) return failed(request.requestId, 'missing-document')
        engine.restore(request.checkpoint)
        return succeeded(request.requestId, { checkpoint: engine.checkpoint() })
      }
      case 'export': {
        const engine = holder.engine
        if (!engine) return failed(request.requestId, 'missing-document')
        const bytes = encodeBytes(codec.write(engine.checkpoint()))
        if (!bytes) return failed(request.requestId, 'export failed')
        return succeeded(request.requestId, { bytes, checkpoint: engine.checkpoint() })
      }
      default:
        return failed('', 'invalid-message')
    }
  }

  return {
    handle(text: string): string[] {
      const parsed = parseDocumentRequest(text)
      if (!parsed.success) {
        return [
          encodeDocumentMessage({
            type: 'result',
            requestId: '',
            ok: false,
            reason: 'invalid-message'
          })
        ]
      }
      try {
        return [encodeDocumentMessage(dispatch(parsed.output))]
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'document process failed'
        return [encodeDocumentMessage(failed(parsed.output.requestId, reason))]
      }
    },
    dispose(): void {
      holder.engine?.dispose()
      holder.engine = null
    }
  }
}

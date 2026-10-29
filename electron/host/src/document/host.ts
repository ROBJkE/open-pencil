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
import { createDocumentRaster, type DocumentRasterPush } from './raster'

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
export function createDocumentProcessHost(push?: DocumentRasterPush) {
  const codec = createPenCodec()
  const holder: EngineHolder = { engine: null }
  const raster = push ? createDocumentRaster(push) : null

  function current(requestId: string): DocumentEngine | DocumentResult {
    const engine = holder.engine
    if (!engine) return failed(requestId, 'missing-document')
    return engine
  }

  function isEngine(value: DocumentEngine | DocumentResult): value is DocumentEngine {
    return !('ok' in value)
  }

  function open(request: Extract<DocumentRequest, { type: 'open' }>): DocumentResult {
    holder.engine?.dispose()
    let bytes: Uint8Array | undefined
    if (request.bytes !== undefined) {
      const decoded = decodeBytes(request.bytes)
      if (!decoded) return failed(request.requestId, 'invalid-bytes')
      bytes = decoded
    }
    const engine = createDocumentEngine({ ...request.spec, bytes }, { codec })
    holder.engine = engine
    raster?.reset()
    return succeeded(request.requestId, {
      documentId: engine.id,
      checkpoint: engine.checkpoint()
    })
  }

  function apply(request: Extract<DocumentRequest, { type: 'apply' }>): DocumentResult {
    const engine = current(request.requestId)
    if (!isEngine(engine)) return engine
    const result = engine.apply(request.command)
    if (result.ack.accepted) raster?.schedule(engine)
    return succeeded(request.requestId, {
      apply: { ack: result.ack, events: result.events },
      checkpoint: engine.checkpoint()
    })
  }

  function withEngine(
    requestId: string,
    read: (engine: DocumentEngine) => DocumentResult
  ): DocumentResult {
    const engine = current(requestId)
    if (!isEngine(engine)) return engine
    return read(engine)
  }

  function dispatch(request: DocumentRequest): DocumentResult {
    switch (request.type) {
      case 'open':
        return open(request)
      case 'apply':
        return apply(request)
      case 'layer-tree':
        return withEngine(request.requestId, (engine) =>
          succeeded(request.requestId, { layerTree: engine.readLayerTree(request.query) })
        )
      case 'selection':
        return withEngine(request.requestId, (engine) =>
          succeeded(request.requestId, { selection: engine.readSelection() })
        )
      case 'viewport':
        return withEngine(request.requestId, (engine) =>
          succeeded(request.requestId, { viewport: engine.readViewport() })
        )
      case 'restore':
        return withEngine(request.requestId, (engine) => {
          engine.restore(request.checkpoint)
          raster?.schedule(engine)
          return succeeded(request.requestId, { checkpoint: engine.checkpoint() })
        })
      case 'export':
        return withEngine(request.requestId, (engine) => {
          const bytes = encodeBytes(codec.write(engine.checkpoint()))
          if (!bytes) return failed(request.requestId, 'export failed')
          return succeeded(request.requestId, { bytes, checkpoint: engine.checkpoint() })
        })
      case 'spatial':
        return withEngine(request.requestId, (engine) =>
          succeeded(request.requestId, { spatial: engine.readSpatialIndex() })
        )
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
      raster?.dispose()
      holder.engine?.dispose()
      holder.engine = null
    }
  }
}

import { fromUint8Array, isValid, toUint8Array } from 'js-base64'
import * as v from 'valibot'

import { MAX_TILE_BYTES, type FrameUpdate } from '@open-pencil/session'
import {
  boundsEntrySchema,
  checkpointSchema,
  commandAckSchema,
  commandSchema,
  dirtyTileSchema,
  layerTreeQuerySchema,
  layerTreeWindowSchema,
  openDocumentSpecSchema,
  selectionPropertiesSchema,
  sessionEventSchema,
  viewportSchema
} from '@open-pencil/session/schema'

/**
 * JSON messages between the main process and one document utility process.
 * Bytes ride along as base64 because the session schemas are JSON.
 */

const applyResultSchema = v.object({
  ack: commandAckSchema,
  events: v.array(sessionEventSchema)
})

const openDocumentRequestSchema = v.object({
  type: v.literal('open'),
  requestId: v.string(),
  spec: openDocumentSpecSchema,
  bytes: v.optional(v.string())
})

const applyDocumentRequestSchema = v.object({
  type: v.literal('apply'),
  requestId: v.string(),
  command: commandSchema
})

const layerTreeDocumentRequestSchema = v.object({
  type: v.literal('layer-tree'),
  requestId: v.string(),
  query: layerTreeQuerySchema
})

const selectionDocumentRequestSchema = v.object({
  type: v.literal('selection'),
  requestId: v.string()
})

const viewportDocumentRequestSchema = v.object({
  type: v.literal('viewport'),
  requestId: v.string()
})

const restoreDocumentRequestSchema = v.object({
  type: v.literal('restore'),
  requestId: v.string(),
  checkpoint: checkpointSchema
})

const exportDocumentRequestSchema = v.object({
  type: v.literal('export'),
  requestId: v.string()
})

const spatialDocumentRequestSchema = v.object({
  type: v.literal('spatial'),
  requestId: v.string()
})

const documentRequestSchema = v.variant('type', [
  openDocumentRequestSchema,
  applyDocumentRequestSchema,
  layerTreeDocumentRequestSchema,
  selectionDocumentRequestSchema,
  viewportDocumentRequestSchema,
  restoreDocumentRequestSchema,
  exportDocumentRequestSchema,
  spatialDocumentRequestSchema
])

const documentResultSchema = v.object({
  type: v.literal('result'),
  requestId: v.string(),
  ok: v.boolean(),
  reason: v.optional(v.string()),
  documentId: v.optional(v.string()),
  apply: v.optional(applyResultSchema),
  layerTree: v.optional(layerTreeWindowSchema),
  selection: v.optional(selectionPropertiesSchema),
  viewport: v.optional(viewportSchema),
  checkpoint: v.optional(checkpointSchema),
  bytes: v.optional(v.string()),
  spatial: v.optional(v.array(boundsEntrySchema))
})

const documentFrameSchema = v.object({
  type: v.literal('frame'),
  documentId: v.string(),
  tiles: v.array(dirtyTileSchema)
})

const documentOutboundSchema = v.variant('type', [documentResultSchema, documentFrameSchema])

const documentTileSchema = v.pipe(
  v.object({
    type: v.literal('tile'),
    documentId: v.string(),
    tile: dirtyTileSchema,
    pixels: v.instance(Uint8Array)
  }),
  v.check(
    (packet) =>
      packet.pixels.byteLength <= MAX_TILE_BYTES &&
      packet.pixels.byteLength === packet.tile.rect.width * packet.tile.rect.height * 4
  )
)

export type DocumentRequest = v.InferOutput<typeof documentRequestSchema>
export type DocumentResult = v.InferOutput<typeof documentResultSchema>
export type DocumentFrame = v.InferOutput<typeof documentFrameSchema>
export type DocumentOutbound = v.InferOutput<typeof documentOutboundSchema>
export type DocumentTilePacket = v.InferOutput<typeof documentTileSchema>

export function parseDocumentRequest(text: string) {
  return v.safeParse(v.pipe(v.string(), v.parseJson(), documentRequestSchema), text)
}

export function parseDocumentResult(text: string) {
  return v.safeParse(v.pipe(v.string(), v.parseJson(), documentResultSchema), text)
}

export function parseDocumentOutbound(text: string) {
  return v.safeParse(v.pipe(v.string(), v.parseJson(), documentOutboundSchema), text)
}

export function parseDocumentTile(value: unknown): DocumentTilePacket | null {
  const parsed = v.safeParse(documentTileSchema, value)
  return parsed.success ? parsed.output : null
}

export function encodeDocumentFrame(frame: FrameUpdate): string {
  return JSON.stringify({
    type: 'frame',
    documentId: frame.documentId,
    tiles: frame.tiles
  } satisfies DocumentFrame)
}

export function encodeDocumentMessage(message: DocumentRequest | DocumentResult): string {
  return JSON.stringify(message)
}

export function encodeBytes(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes || bytes.byteLength === 0) return undefined
  return fromUint8Array(bytes)
}

export function decodeBytes(value: string): Uint8Array | null {
  if (!isValid(value)) return null
  return toUint8Array(value)
}

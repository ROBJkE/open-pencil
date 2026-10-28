import { MAX_TILE_BYTES, PayloadTooLargeError } from './caps'
import type { DirtyTile, FrameUpdate } from './schema'

export interface TilePixels {
  tile: DirtyTile
  pixels: Uint8Array
}

export interface FramePublish extends FrameUpdate {
  pixelTiles: TilePixels[]
}

export interface FrameTransport {
  publish(update: FramePublish): void
  subscribe(documentId: string, listener: (update: FrameUpdate) => void): () => void
  pixels(documentId: string, tileId: number): Uint8Array | undefined
}

export function createMemoryFrameTransport(): FrameTransport {
  const listeners = new Map<string, Set<(update: FrameUpdate) => void>>()
  const latest = new Map<string, Map<number, Uint8Array>>()

  return {
    publish(update) {
      for (const tile of update.pixelTiles) {
        if (tile.pixels.byteLength > MAX_TILE_BYTES) {
          throw new PayloadTooLargeError(tile.pixels.byteLength, MAX_TILE_BYTES)
        }
      }
      const documentTiles = latest.get(update.documentId) ?? new Map<number, Uint8Array>()
      for (const tile of update.pixelTiles) documentTiles.set(tile.tile.id, tile.pixels)
      latest.set(update.documentId, documentTiles)
      const frame: FrameUpdate = { documentId: update.documentId, tiles: update.tiles }
      for (const listener of listeners.get(update.documentId) ?? []) listener(frame)
    },
    subscribe(documentId, listener) {
      const group = listeners.get(documentId) ?? new Set<(update: FrameUpdate) => void>()
      group.add(listener)
      listeners.set(documentId, group)
      return () => {
        group.delete(listener)
      }
    },
    pixels(documentId, tileId) {
      return latest.get(documentId)?.get(tileId)
    }
  }
}

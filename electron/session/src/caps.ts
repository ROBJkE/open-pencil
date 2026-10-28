/** Largest IPC JSON payload. Tile pixels travel beside this cap, one tile at a time. */
export const MAX_IPC_BYTES = 256 * 1024

/** Rows returned for one layer-tree read. The UI asks again as the user scrolls. */
export const MAX_LAYER_ROWS = 200

export const JOB_POOL_CAP = 2

/** Square dirty-tile edge in pixels. RGBA, so a tile is at most this squared times 4 bytes. */
export const TILE_SIZE = 256

export const MAX_TILE_BYTES = TILE_SIZE * TILE_SIZE * 4

/**
 * How many document utility processes may run at once.
 * Extra opens wait. One stuck document cannot occupy every slot forever
 * because the cap is a queue, not a shared heap.
 */
export function documentProcessCap(cpuCount: number): number {
  const count = Number.isFinite(cpuCount) && cpuCount > 0 ? Math.floor(cpuCount) : 1
  return Math.min(4, Math.max(2, count - 1))
}

export class PayloadTooLargeError extends Error {
  readonly size: number
  readonly limit: number

  constructor(size: number, limit: number) {
    super(`IPC payload is ${size} bytes, limit is ${limit}`)
    this.name = 'PayloadTooLargeError'
    this.size = size
    this.limit = limit
  }
}

export function payloadByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function assertPayloadWithinCap(value: unknown): void {
  const size = payloadByteLength(value)
  if (size > MAX_IPC_BYTES) throw new PayloadTooLargeError(size, MAX_IPC_BYTES)
}

export function clampLayerLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 1
  return Math.min(Math.floor(limit), MAX_LAYER_ROWS)
}

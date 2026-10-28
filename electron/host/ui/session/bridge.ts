import { parseHostEvent, type HostEvent } from '#host/main/host-events'
import { parseWire } from '#host/wire'
import * as v from 'valibot'

import type {
  BoundsEntry,
  CommandAck,
  DirtyTile,
  FrameUpdate,
  LayerTreeQuery,
  LayerTreeWindow,
  ProcessSupervisor,
  SelectionProperties,
  SessionClient,
  ViewportSummary
} from '@open-pencil/session'
import {
  boundsEntrySchema,
  commandAckSchema,
  dirtyTileSchema,
  frameUpdateSchema,
  layerTreeWindowSchema,
  selectionPropertiesSchema,
  sessionEventSchema,
  viewportSchema
} from '@open-pencil/session/schema'

/** The preload object. Values that cross the bridge are parsed again here. */
export interface OpenPencilBridge {
  openDocument(spec: unknown): Promise<unknown>
  closeDocument(id: unknown): Promise<unknown>
  submit(id: unknown, command: unknown): Promise<unknown>
  layerTree(id: unknown, query: unknown): Promise<unknown>
  selection(id: unknown): Promise<unknown>
  viewport(id: unknown): Promise<unknown>
  activate(id: unknown): Promise<unknown>
  subscribe(id: unknown, listener: (event: unknown) => void): () => void
  onHostEvent(listener: (event: unknown) => void): () => void
  documentCap(): Promise<unknown>
  spatial(id: unknown): Promise<unknown>
  openFile(): Promise<unknown>
  saveFile(): Promise<unknown>
  onFrame(id: unknown, listener: (frame: unknown) => void): () => void
  onTile(id: unknown, listener: (tile: unknown, pixels: unknown) => void): () => void
  replyRestart(id: unknown, action: unknown): void
  setMenuState(state: unknown): Promise<unknown>
  secrets: {
    read(account: unknown): Promise<unknown>
    write(account: unknown, secret: unknown): Promise<unknown>
    remove(account: unknown): Promise<unknown>
  }
}

const EMPTY_SELECTION: SelectionProperties = { ids: [], fields: {}, mixed: [] }
const EMPTY_VIEWPORT: ViewportSummary = {
  pageId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  width: 0,
  height: 0
}
const FAILED_ACK: CommandAck = { accepted: false, sequence: 0, reason: 'invalid-message' }

function emptyTree(query: LayerTreeQuery): LayerTreeWindow {
  return {
    parentId: query.parentId,
    offset: query.offset,
    limit: query.limit,
    rows: [],
    total: 0
  }
}

async function readId(pending: Promise<unknown>): Promise<string> {
  const id = await pending
  if (typeof id !== 'string' || id.length === 0) throw new Error('open failed')
  return id
}

function readAck(value: unknown): CommandAck {
  return parseWire(commandAckSchema, value) ?? FAILED_ACK
}

function readTree(value: unknown, query: LayerTreeQuery): LayerTreeWindow {
  return parseWire(layerTreeWindowSchema, value) ?? emptyTree(query)
}

function stubSupervisor(bridge: OpenPencilBridge, documentCap: number): ProcessSupervisor {
  return {
    documentCap,
    jobCap: 0,
    open(spec) {
      return readId(bridge.openDocument(spec))
    },
    async close(id) {
      await bridge.closeDocument(id)
    },
    async submit(id, command) {
      return { ack: readAck(await bridge.submit(id, command)), events: [] }
    },
    async layerTree(id, query) {
      return readTree(await bridge.layerTree(id, query), query)
    },
    async selection(id) {
      return parseWire(selectionPropertiesSchema, await bridge.selection(id)) ?? EMPTY_SELECTION
    },
    async viewport(id) {
      return parseWire(viewportSchema, await bridge.viewport(id)) ?? EMPTY_VIEWPORT
    },
    subscribe(id, listener) {
      return bridge.subscribe(id, (value) => {
        const event = parseWire(sessionEventSchema, value)
        if (event) listener(event)
      })
    },
    async crash() {
      return undefined
    },
    async enqueue() {
      return { id: '', accepted: false, reason: 'unavailable' }
    },
    completeJob() {
      return undefined
    },
    async shutdown() {
      return undefined
    }
  }
}

/** Session client whose reads and commands go through `window.openpencil`. */
export function createBridgeSession(bridge: OpenPencilBridge, documentCap: number): SessionClient {
  const supervisor = stubSupervisor(bridge, documentCap)
  return {
    supervisor,
    openDocument(spec) {
      return supervisor.open(spec)
    },
    closeDocument(id) {
      return supervisor.close(id)
    },
    async submit(id, command) {
      const result = await supervisor.submit(id, command, 'interaction')
      return result.ack
    },
    layerTree(id, query) {
      return supervisor.layerTree(id, query)
    },
    selection(id) {
      return supervisor.selection(id)
    },
    viewport(id) {
      return supervisor.viewport(id)
    },
    subscribe(id, listener) {
      return supervisor.subscribe(id, listener)
    }
  }
}

export function subscribeHost(
  bridge: OpenPencilBridge,
  listener: (event: HostEvent) => void
): () => void {
  return bridge.onHostEvent((value) => {
    const event = parseHostEvent(value)
    if (event) listener(event)
  })
}

export async function readSpatial(bridge: OpenPencilBridge, id: string): Promise<BoundsEntry[]> {
  return parseWire(v.array(boundsEntrySchema), await bridge.spatial(id)) ?? []
}

export function subscribeFrame(
  bridge: OpenPencilBridge,
  id: string,
  listener: (frame: FrameUpdate) => void
): () => void {
  return bridge.onFrame(id, (value) => {
    const frame = parseWire(frameUpdateSchema, value)
    if (frame) listener(frame)
  })
}

export function subscribeTile(
  bridge: OpenPencilBridge,
  id: string,
  listener: (tile: DirtyTile, pixels: Uint8Array) => void
): () => void {
  return bridge.onTile(id, (tileValue, pixels) => {
    const tile = parseWire(dirtyTileSchema, tileValue)
    if (!tile || !(pixels instanceof Uint8Array)) return
    listener(tile, pixels)
  })
}

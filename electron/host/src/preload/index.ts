import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import * as v from 'valibot'

import { MAX_TILE_BYTES } from '@open-pencil/session'
import { dirtyTileSchema, frameUpdateSchema, sessionEventSchema } from '@open-pencil/session/schema'

import {
  HOST_EVENT,
  HOST_LISTENING,
  MENU_STATE,
  RESTART_REPLY,
  SECRET_READ,
  SECRET_REMOVE,
  SECRET_WRITE,
  SESSION_ACTIVATE,
  SESSION_CAP,
  SESSION_CLOSE,
  SESSION_EVENT,
  SESSION_FRAME,
  SESSION_LAYER_TREE,
  SESSION_OPEN,
  SESSION_OPEN_FILE,
  SESSION_SAVE_FILE,
  SESSION_SELECTION,
  SESSION_SPATIAL,
  SESSION_SUBMIT,
  SESSION_SUBSCRIBE,
  SESSION_TILE,
  SESSION_UNSUBSCRIBE,
  SESSION_VIEWPORT
} from '../main/channels'
import { parseHostEvent } from '../main/host-events'
import { parseWire } from '../wire'

/**
 * The only object the editor page receives. It is the session client, secret
 * store, and host events. Node, the file system, and Electron itself stay here.
 */
const openpencil = {
  openDocument: (spec: unknown) => ipcRenderer.invoke(SESSION_OPEN, spec),
  closeDocument: (id: unknown) => ipcRenderer.invoke(SESSION_CLOSE, id),
  submit: (id: unknown, command: unknown) => ipcRenderer.invoke(SESSION_SUBMIT, id, command),
  layerTree: (id: unknown, query: unknown) => ipcRenderer.invoke(SESSION_LAYER_TREE, id, query),
  selection: (id: unknown) => ipcRenderer.invoke(SESSION_SELECTION, id),
  viewport: (id: unknown) => ipcRenderer.invoke(SESSION_VIEWPORT, id),
  activate: (id: unknown) => ipcRenderer.invoke(SESSION_ACTIVATE, id),
  documentCap: async () => {
    const value: unknown = await ipcRenderer.invoke(SESSION_CAP)
    return typeof value === 'number' && Number.isFinite(value) ? value : 2
  },
  spatial: async (id: unknown) => {
    const value: unknown = await ipcRenderer.invoke(SESSION_SPATIAL, id)
    const parsed = v.safeParse(v.array(v.unknown()), value)
    return parsed.success ? parsed.output : []
  },
  openFile: async () => {
    const value: unknown = await ipcRenderer.invoke(SESSION_OPEN_FILE)
    return typeof value === 'string' ? value : null
  },
  saveFile: async () => {
    const value: unknown = await ipcRenderer.invoke(SESSION_SAVE_FILE)
    return typeof value === 'string' ? value : null
  },
  onFrame(id: unknown, listener: (frame: unknown) => void) {
    if (typeof id !== 'string' || typeof listener !== 'function') return () => undefined
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
      const frame = parseWire(frameUpdateSchema, payload)
      if (!frame || frame.documentId !== id) return
      listener(frame)
    }
    ipcRenderer.on(SESSION_FRAME, wrapped)
    return () => {
      ipcRenderer.removeListener(SESSION_FRAME, wrapped)
    }
  },
  onTile(id: unknown, listener: (tile: unknown, pixels: unknown) => void) {
    if (typeof id !== 'string' || typeof listener !== 'function') return () => undefined
    const wrapped = (
      _event: IpcRendererEvent,
      documentId: unknown,
      payload: unknown,
      pixels: unknown
    ) => {
      if (documentId !== id || !(pixels instanceof Uint8Array)) return
      const tile = parseWire(dirtyTileSchema, payload)
      if (!tile) return
      if (pixels.byteLength > MAX_TILE_BYTES) return
      if (pixels.byteLength !== tile.rect.width * tile.rect.height * 4) return
      listener(tile, pixels)
    }
    ipcRenderer.on(SESSION_TILE, wrapped)
    return () => {
      ipcRenderer.removeListener(SESSION_TILE, wrapped)
    }
  },
  subscribe(id: unknown, listener: (event: unknown) => void) {
    if (typeof id !== 'string' || typeof listener !== 'function') return () => undefined
    const wrapped = (_event: IpcRendererEvent, documentId: unknown, payload: unknown) => {
      if (documentId !== id) return
      const parsed = parseWire(sessionEventSchema, payload)
      if (parsed) listener(parsed)
    }
    ipcRenderer.on(SESSION_EVENT, wrapped)
    ipcRenderer.send(SESSION_SUBSCRIBE, id)
    return () => {
      ipcRenderer.removeListener(SESSION_EVENT, wrapped)
      ipcRenderer.send(SESSION_UNSUBSCRIBE, id)
    }
  },
  onHostEvent(listener: (event: unknown) => void) {
    if (typeof listener !== 'function') return () => undefined
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
      const parsed = parseHostEvent(payload)
      if (parsed) listener(parsed)
    }
    ipcRenderer.on(HOST_EVENT, wrapped)
    ipcRenderer.send(HOST_LISTENING)
    return () => {
      ipcRenderer.removeListener(HOST_EVENT, wrapped)
    }
  },
  replyRestart: (id: unknown, action: unknown) => {
    ipcRenderer.send(RESTART_REPLY, { id, action })
  },
  setMenuState: (state: unknown) => ipcRenderer.invoke(MENU_STATE, state),
  secrets: {
    read: (account: unknown) => ipcRenderer.invoke(SECRET_READ, account),
    write: (account: unknown, secret: unknown) => ipcRenderer.invoke(SECRET_WRITE, account, secret),
    remove: (account: unknown) => ipcRenderer.invoke(SECRET_REMOVE, account)
  }
}

contextBridge.exposeInMainWorld('openpencil', openpencil)

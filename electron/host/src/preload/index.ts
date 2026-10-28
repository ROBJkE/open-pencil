import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import { sessionEventSchema } from '@open-pencil/session/schema'

import {
  HOST_EVENT,
  HOST_LISTENING,
  MENU_STATE,
  RESTART_REPLY,
  SECRET_READ,
  SECRET_REMOVE,
  SECRET_WRITE,
  SESSION_ACTIVATE,
  SESSION_CLOSE,
  SESSION_EVENT,
  SESSION_LAYER_TREE,
  SESSION_OPEN,
  SESSION_SELECTION,
  SESSION_SUBMIT,
  SESSION_SUBSCRIBE,
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

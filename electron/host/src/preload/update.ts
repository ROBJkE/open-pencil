import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import {
  UPDATE_CHECK,
  UPDATE_CLOSE,
  UPDATE_DOWNLOAD,
  UPDATE_RESTART,
  UPDATE_STATUS
} from '../main/channels'
import { parseUpdateStatus } from '../main/host-events'

/** Update window bridge. It cannot open a document. */
const openpencilUpdate = {
  check: () => ipcRenderer.invoke(UPDATE_CHECK),
  download: () => ipcRenderer.invoke(UPDATE_DOWNLOAD),
  restart: () => ipcRenderer.invoke(UPDATE_RESTART),
  close: () => ipcRenderer.invoke(UPDATE_CLOSE),
  onStatus(listener: (status: unknown) => void) {
    if (typeof listener !== 'function') return () => undefined
    const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
      const parsed = parseUpdateStatus(payload)
      if (parsed) listener(parsed)
    }
    ipcRenderer.on(UPDATE_STATUS, wrapped)
    return () => {
      ipcRenderer.removeListener(UPDATE_STATUS, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('openpencilUpdate', openpencilUpdate)

import { ipcMain, type WebContents } from 'electron'
import * as v from 'valibot'

import { isMutation, PayloadTooLargeError, type SessionClient } from '@open-pencil/session'
import {
  commandSchema,
  layerTreeQuerySchema,
  openDocumentSpecSchema
} from '@open-pencil/session/schema'

import type { UtilitySupervisor } from '../document/supervisor'
import { parseWire } from '../wire'
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
  SESSION_OPEN_FILE,
  SESSION_SAVE_FILE,
  SESSION_SELECTION,
  SESSION_SPATIAL,
  SESSION_SUBMIT,
  SESSION_SUBSCRIBE,
  SESSION_UNSUBSCRIBE,
  SESSION_VIEWPORT,
  SESSION_CAP,
  UPDATE_CHECK,
  UPDATE_CLOSE,
  UPDATE_DOWNLOAD,
  UPDATE_RESTART,
  UPDATE_STATUS
} from './channels'
import {
  parseMenuState,
  parseRestartReply,
  type HostEvent,
  type RestartReply,
  type UpdateStatus
} from './host-events'
import type { MenuController } from './menu'
import type { SecretStore } from './secrets'

interface DocumentFileAPI {
  openSpec(spec: { name: string; id?: string; readOnly?: boolean }): Promise<string>
  openEmpty(): Promise<string>
  openFromDialog(): Promise<string | null>
  openFromPath(filePath: string): Promise<string>
  openRecent(index: number): Promise<string | null>
  clearRecent(): Promise<void>
  save(id?: string | null): Promise<string | null>
  saveAs(id?: string | null): Promise<string | null>
  close(id?: string | null): Promise<void>
  activate(id: string): void
  markDirty(id: string): void
}

export interface IpcHost {
  client: SessionClient
  supervisor: UtilitySupervisor
  files: DocumentFileAPI
  secrets: SecretStore
  menu: MenuController
  sendHost: (event: HostEvent) => void
  onRestartReply: (reply: RestartReply) => void
  markHostListening: () => void
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  restartForUpdate: () => Promise<boolean>
  closeUpdateWindow: () => void
  sendUpdateStatus: (status: UpdateStatus) => void
}

const subscriptions = new Map<string, Array<() => void>>()

function subscriptionKey(senderId: number, documentId: string): string {
  return `${senderId}:${documentId}`
}

export function dropSender(senderId: number): void {
  for (const [key, stops] of subscriptions) {
    if (!key.startsWith(`${senderId}:`)) continue
    for (const stop of stops) stop()
    subscriptions.delete(key)
  }
}

function senderId(sender: WebContents): number {
  return sender.id
}

export function installIpc(host: IpcHost): void {
  ipcMain.handle(SESSION_OPEN, async (_event, spec: unknown) => {
    const parsed = parseWire(openDocumentSpecSchema, spec)
    if (!parsed) return null
    return host.files.openSpec(parsed)
  })

  ipcMain.handle(SESSION_CLOSE, async (_event, id: unknown) => {
    const documentId = parseWire(v.string(), id)
    if (!documentId) return
    await host.files.close(documentId)
  })

  ipcMain.handle(SESSION_SUBMIT, async (_event, id: unknown, command: unknown) => {
    const documentId = parseWire(v.string(), id)
    const parsed = parseWire(commandSchema, command)
    if (!documentId || !parsed) return { accepted: false, sequence: 0, reason: 'invalid-message' }
    try {
      const ack = await host.client.submit(documentId, parsed)
      if (ack.accepted && isMutation(parsed)) host.files.markDirty(documentId)
      return ack
    } catch (error) {
      if (error instanceof PayloadTooLargeError) throw error
      const reason = error instanceof Error ? error.message : 'document process failed'
      return { accepted: false, sequence: 0, reason }
    }
  })

  ipcMain.handle(SESSION_LAYER_TREE, async (_event, id: unknown, query: unknown) => {
    const documentId = parseWire(v.string(), id)
    const parsed = parseWire(layerTreeQuerySchema, query)
    if (!documentId || !parsed) return { parentId: null, offset: 0, limit: 1, rows: [], total: 0 }
    return host.client.layerTree(documentId, parsed)
  })

  ipcMain.handle(SESSION_SELECTION, async (_event, id: unknown) => {
    const documentId = parseWire(v.string(), id)
    if (!documentId) return { ids: [], fields: {}, mixed: [] }
    return host.client.selection(documentId)
  })

  ipcMain.handle(SESSION_VIEWPORT, async (_event, id: unknown) => {
    const documentId = parseWire(v.string(), id)
    if (!documentId) return { pageId: null, zoom: 1, panX: 0, panY: 0, width: 0, height: 0 }
    return host.client.viewport(documentId)
  })

  ipcMain.handle(SESSION_SPATIAL, async (_event, id: unknown) => {
    const documentId = parseWire(v.string(), id)
    if (!documentId) return []
    return host.supervisor.spatialIndex(documentId)
  })

  ipcMain.handle(SESSION_CAP, () => host.supervisor.documentCap)

  ipcMain.handle(SESSION_OPEN_FILE, () => host.files.openFromDialog())

  ipcMain.handle(SESSION_SAVE_FILE, () => host.files.save())

  ipcMain.handle(SESSION_ACTIVATE, async (_event, id: unknown) => {
    const documentId = parseWire(v.string(), id)
    if (!documentId) return
    host.files.activate(documentId)
  })

  ipcMain.on(SESSION_SUBSCRIBE, (event, id: unknown) => {
    const documentId = parseWire(v.string(), id)
    if (!documentId) return
    const sender = event.sender
    const stop = host.supervisor.subscribe(documentId, (sessionEvent) => {
      if (sender.isDestroyed()) return
      sender.send(SESSION_EVENT, documentId, JSON.stringify(sessionEvent))
    })
    const key = subscriptionKey(senderId(sender), documentId)
    const stops = subscriptions.get(key) ?? []
    stops.push(stop)
    subscriptions.set(key, stops)
  })

  ipcMain.on(SESSION_UNSUBSCRIBE, (event, id: unknown) => {
    const documentId = parseWire(v.string(), id)
    if (!documentId) return
    const key = subscriptionKey(senderId(event.sender), documentId)
    const stops = subscriptions.get(key)
    if (!stops) return
    const stop = stops.pop()
    if (stop) stop()
    if (stops.length === 0) subscriptions.delete(key)
  })

  ipcMain.on(HOST_LISTENING, () => {
    host.markHostListening()
  })

  ipcMain.on(RESTART_REPLY, (_event, payload: unknown) => {
    const reply = parseRestartReply(payload)
    if (!reply) return
    host.onRestartReply(reply)
  })

  ipcMain.handle(MENU_STATE, async (_event, payload: unknown) => {
    const state = parseMenuState(payload)
    if (!state) return
    if (state.features) host.menu.setFeatures(state.features)
    if (state.checked) {
      for (const [id, checked] of Object.entries(state.checked)) host.menu.setChecked(id, checked)
    }
  })

  ipcMain.handle(SECRET_READ, async (_event, account: unknown) => {
    const parsed = parseWire(v.string(), account)
    if (!parsed) return { ok: false, error: 'invalid-account' }
    const result = await host.secrets.read(parsed)
    if (!result.ok) host.sendHost({ type: 'secret-error', error: result.error })
    return result
  })

  ipcMain.handle(SECRET_WRITE, async (_event, account: unknown, secret: unknown) => {
    const parsedAccount = parseWire(v.string(), account)
    const parsedSecret = parseWire(v.string(), secret)
    if (!parsedAccount || parsedSecret === null) return { ok: false, error: 'invalid-value' }
    const result = await host.secrets.write(parsedAccount, parsedSecret)
    if (!result.ok) host.sendHost({ type: 'secret-error', error: result.error })
    return result
  })

  ipcMain.handle(SECRET_REMOVE, async (_event, account: unknown) => {
    const parsed = parseWire(v.string(), account)
    if (!parsed) return { ok: false, error: 'invalid-account' }
    const result = await host.secrets.remove(parsed)
    if (!result.ok) host.sendHost({ type: 'secret-error', error: result.error })
    return result
  })

  ipcMain.handle(UPDATE_CHECK, () => host.checkForUpdates())
  ipcMain.handle(UPDATE_DOWNLOAD, () => host.downloadUpdate())
  ipcMain.handle(UPDATE_RESTART, () => host.restartForUpdate())
  ipcMain.handle(UPDATE_CLOSE, () => {
    host.closeUpdateWindow()
  })
}

export function sendUpdate(window: WebContents, status: UpdateStatus): void {
  if (window.isDestroyed()) return
  window.send(UPDATE_STATUS, JSON.stringify(status))
}

export { HOST_EVENT }

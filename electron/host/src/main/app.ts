import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { isAbsolute, resolve } from 'node:path'

import { app, dialog, type BrowserWindow } from 'electron'

import { createSessionClient } from '@open-pencil/session'

import { forkDocumentRuntime } from '../document/fork'
import { createUtilitySupervisor, type UtilitySupervisor } from '../document/supervisor'
import { SESSION_FRAME, SESSION_TILE } from './channels'
import { createDocumentFiles } from './files'
import type { HostEvent, UpdateStatus } from './host-events'
import { HOST_EVENT, dropSender, installIpc, sendUpdate } from './ipc'
import { launchTargets, parseDeepLink } from './links'
import { installApplicationMenu, type MenuController } from './menu'
import { bundledPath, workerPath } from './paths'
import { decideRestart, type SaveDecision } from './restart'
import { createElectronSecretStore } from './safe-storage'
import { createElectronUpdateClient, type UpdateClient } from './updates'
import { createEditorWindow, createUpdateWindow, reloadEditor } from './window'

type DocumentFiles = ReturnType<typeof createDocumentFiles>

let editor: BrowserWindow | null = null
let updater: BrowserWindow | null = null
let hostListening = false
let allowQuit = false
let quitPrompt = false
let files: DocumentFiles | null = null
let menu: MenuController | null = null
let supervisor: UtilitySupervisor | null = null
let updates: UpdateClient | null = null
const restartWaiters = new Map<string, (action: SaveDecision) => void>()
const queuedArgs: string[][] = []

function editorWindow(): BrowserWindow | null {
  return editor && !editor.isDestroyed() ? editor : null
}

function sendHost(event: HostEvent): void {
  const current = editorWindow()
  if (!current) return
  current.webContents.send(HOST_EVENT, JSON.stringify(event))
}

function publishUpdate(status: UpdateStatus): void {
  if (!updater || updater.isDestroyed()) return
  sendUpdate(updater.webContents, status)
}

function showEditor(): BrowserWindow {
  const current = editorWindow()
  if (current) {
    if (current.isMinimized()) current.restore()
    current.focus()
    return current
  }
  editor = createEditorWindow(bundledPath('preload.cjs'))
  const created = editor
  const sender = created.webContents.id
  created.on('closed', () => {
    dropSender(sender)
    if (editor === created) editor = null
  })
  created.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || created.isDestroyed()) return
    console.error(`Renderer process ended (${details.reason})`)
    reloadEditor(created)
  })
  created.on('close', (event) => {
    if (allowQuit || !files?.hasDirty()) return
    event.preventDefault()
    void (async () => {
      const approved = await confirmQuit('Save open documents before quitting?')
      if (!approved || created.isDestroyed()) return
      allowQuit = true
      created.close()
    })()
  })
  return created
}

function openUpdateWindow(): BrowserWindow {
  if (updater && !updater.isDestroyed()) {
    updater.focus()
    return updater
  }
  updater = createUpdateWindow(bundledPath('update-preload.cjs'))
  const created = updater
  created.on('closed', () => {
    if (updater === created) updater = null
  })
  return created
}

function registerProtocol(): void {
  if (process.defaultApp) {
    const script = process.argv[1]
    if (script) app.setAsDefaultProtocolClient('openpencil', process.execPath, [script])
    return
  }
  app.setAsDefaultProtocolClient('openpencil')
}

function once<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settled = false
  let resolvePromise: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
  })
  return {
    promise,
    settle: (value) => {
      resolvePromise(value)
    }
  }
}

function askEditor(): Promise<SaveDecision | 'timeout'> {
  const current = editorWindow()
  if (!hostListening || !current) return Promise.resolve('timeout')
  const id = crypto.randomUUID()
  current.webContents.send(HOST_EVENT, JSON.stringify({ type: 'restart-request', id }))
  const result = once<SaveDecision | 'timeout'>()
  const timer = setTimeout(() => {
    restartWaiters.delete(id)
    result.settle('timeout')
  }, 30_000)
  restartWaiters.set(id, (action) => {
    clearTimeout(timer)
    restartWaiters.delete(id)
    result.settle(action)
  })
  return result.promise
}

function askNative(message: string): Promise<SaveDecision> {
  const options = {
    type: 'question' as const,
    buttons: ['Finish saves', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message,
    detail: 'The software update window does not keep documents open.'
  }
  const parent = editorWindow()
  const prompt = parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
  return prompt.then((choice) => (choice.response === 0 ? 'finish' : 'cancel'))
}

async function confirmQuit(message: string): Promise<boolean> {
  if (!files || quitPrompt) return false
  quitPrompt = true
  try {
    const decision = await decideRestart({
      dirty: files.hasDirty(),
      askEditor,
      askNative: () => askNative(message)
    })
    if (decision === 'cancel') return false
    return await files.saveAllDirty()
  } finally {
    quitPrompt = false
  }
}

async function runMenu(id: string, checked?: boolean): Promise<void> {
  if (!files) return
  try {
    if (id.startsWith('open-recent:')) {
      const index = Number(id.slice('open-recent:'.length))
      if (Number.isInteger(index)) await files.openRecent(index)
      return
    }
    switch (id) {
      case 'new':
        await files.openEmpty()
        return
      case 'open':
        await files.openFromDialog()
        return
      case 'save':
        await files.save()
        return
      case 'save-as':
      case 'save-to':
        await files.saveAs()
        return
      case 'close':
        await files.close()
        return
      case 'clear-recent-files':
        await files.clearRecent()
        return
      case 'quit':
        if (await confirmQuit('Save open documents before quitting?')) {
          allowQuit = true
          app.quit()
        }
        return
      case 'dev-tools':
        editorWindow()?.webContents.toggleDevTools()
        return
      case 'check-updates':
        await checkForUpdates()
        return
      default:
        sendHost({ type: 'menu', id, ...(checked === undefined ? {} : { checked }) })
    }
  } catch (error) {
    console.error(error)
  }
}

async function acceptArgs(argv: readonly string[]): Promise<void> {
  if (!files) return
  const targets = launchTargets(argv)
  for (const filePath of targets.pens) {
    const resolved = isAbsolute(filePath) ? filePath : resolve(filePath)
    if (!existsSync(resolved)) continue
    await files.openFromPath(resolved)
  }
  for (const filePath of targets.figs) {
    sendHost({ type: 'link', link: { type: 'open', file: filePath, node: null } })
  }
  for (const url of targets.links) {
    const link = parseDeepLink(url)
    if (link) sendHost({ type: 'link', link })
  }
}

async function checkForUpdates(): Promise<void> {
  if (!updates) return
  openUpdateWindow()
  publishUpdate({ state: 'checking', detail: 'Checking for updates…' })
  try {
    const version = await updates.check()
    publishUpdate(
      version
        ? { state: 'available', detail: `Update ${version} is available.` }
        : { state: 'idle', detail: 'OpenPencil is up to date.' }
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Update check failed'
    publishUpdate({ state: 'error', detail })
  }
}

async function downloadUpdate(): Promise<void> {
  if (!updates) return
  publishUpdate({ state: 'downloading', detail: 'Downloading update…' })
  try {
    await updates.download()
    publishUpdate({ state: 'downloaded', detail: 'Update ready to install.' })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Update download failed'
    publishUpdate({ state: 'error', detail })
  }
}

async function restartForUpdate(): Promise<boolean> {
  if (!files || !updates) return false
  const decision = await decideRestart({
    dirty: files.hasDirty(),
    askEditor,
    askNative: () => askNative('Save open documents before restarting?')
  })
  if (decision === 'cancel') return false
  const saved = await files.saveAllDirty()
  if (!saved) return false
  allowQuit = true
  updates.install()
  return true
}

export async function startElectronApp(): Promise<void> {
  registerProtocol()
  app.on('second-instance', (_event, argv) => {
    if (!files) {
      queuedArgs.push(argv)
      return
    }
    showEditor()
    void acceptArgs(argv)
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (!files) {
      queuedArgs.push([url])
      return
    }
    showEditor()
    void acceptArgs([url])
  })
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    console.error(`Child process ended (${details.type}, ${details.reason})`)
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (allowQuit || !files?.hasDirty()) {
      void supervisor?.shutdown()
      return
    }
    event.preventDefault()
    void (async () => {
      const approved = await confirmQuit('Save open documents before quitting?')
      if (!approved) return
      allowQuit = true
      app.quit()
    })()
  })
  app.on('activate', () => {
    if (!files || editorWindow()) return
    showEditor()
  })

  await app.whenReady()
  app.setName('OpenPencil')
  const userData = app.getPath('userData')
  supervisor = createUtilitySupervisor({
    cpuCount: availableParallelism(),
    factory: { spawn: () => forkDocumentRuntime(workerPath()) }
  })
  const documentHost = supervisor
  documentHost.onFrame((frame) => {
    const current = editorWindow()
    if (!current) return
    current.webContents.send(SESSION_FRAME, JSON.stringify(frame))
  })
  documentHost.onTile((packet) => {
    const current = editorWindow()
    if (!current) return
    current.webContents.send(
      SESSION_TILE,
      packet.documentId,
      JSON.stringify(packet.tile),
      packet.pixels
    )
  })
  menu = installApplicationMenu({
    onAction: (id, checked) => {
      void runMenu(id, checked)
    }
  })
  files = createDocumentFiles({
    openDocument: (spec) => documentHost.open(spec),
    exportBytes: (id) => documentHost.exportBytes(id),
    closeDocument: (id) => documentHost.close(id),
    getWindow: editorWindow,
    userData,
    send: sendHost,
    onRecent: (paths) => menu?.setRecent(paths)
  })
  updates = createElectronUpdateClient()
  installIpc({
    client: createSessionClient(documentHost),
    supervisor: documentHost,
    files,
    secrets: createElectronSecretStore(userData),
    menu,
    sendHost,
    onRestartReply: (reply) => {
      restartWaiters.get(reply.id)?.(reply.action)
    },
    markHostListening: () => {
      hostListening = true
      const current = files
      sendHost({
        type: 'documents',
        documents: current ? current.list() : [],
        activeId: current?.activeId() ?? null
      })
    },
    checkForUpdates,
    downloadUpdate,
    restartForUpdate,
    closeUpdateWindow: () => {
      if (updater && !updater.isDestroyed()) updater.close()
    },
    sendUpdateStatus: publishUpdate
  })
  showEditor()
  await acceptArgs(process.argv)
  for (const argv of queuedArgs.splice(0)) await acceptArgs(argv)
}

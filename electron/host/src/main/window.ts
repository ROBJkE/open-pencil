import { fileURLToPath } from 'node:url'

import { BrowserWindow, shell } from 'electron'

import { isAllowedExternalURL } from './links'
import { editorHTMLPath } from './paths'
import { emptyShellURL, updateShellURL } from './shell'

const DEV_SERVER_URL = 'http://127.0.0.1:4179'

const WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
} as const

function devServer(): boolean {
  return process.env.OPENPENCIL_DEV === '1'
}

function isDevServerURL(url: string): boolean {
  return url === DEV_SERVER_URL || url.startsWith(`${DEV_SERVER_URL}/`)
}

function isEditorFile(url: string, shellPath: string | null): boolean {
  if (!shellPath) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') return false
    return fileURLToPath(parsed) === shellPath
  } catch {
    return false
  }
}

export function installNavigationGuards(window: BrowserWindow, shellPath: string | null): void {
  const { webContents } = window
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalURL(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const guard = (event: { preventDefault: () => void }, url: string) => {
    if (isEditorFile(url, shellPath) || isDevServerURL(url)) return
    event.preventDefault()
    if (isAllowedExternalURL(url)) void shell.openExternal(url)
  }
  webContents.on('will-navigate', guard)
  webContents.on('will-redirect', guard)
}

export function createEditorWindow(preloadPath: string): BrowserWindow {
  const shellPath = editorHTMLPath()
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'OpenPencil',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      ...WEB_PREFERENCES,
      preload: preloadPath
    }
  })
  installNavigationGuards(window, shellPath)
  window.once('ready-to-show', () => {
    window.show()
  })
  if (devServer()) {
    window.webContents.openDevTools()
    void window.loadURL(DEV_SERVER_URL)
  } else if (shellPath) void window.loadFile(shellPath)
  else void window.loadURL(emptyShellURL())
  return window
}

/** The software-update window loads its own page and never the editor shell. */
export function createUpdateWindow(preloadPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 440,
    height: 280,
    title: 'Software Update',
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    webPreferences: {
      ...WEB_PREFERENCES,
      preload: preloadPath
    }
  })
  installNavigationGuards(window, null)
  void window.loadURL(updateShellURL())
  return window
}

export function reloadEditor(window: BrowserWindow): void {
  if (devServer()) {
    void window.loadURL(DEV_SERVER_URL)
    return
  }
  const shellPath = editorHTMLPath()
  if (shellPath) void window.loadFile(shellPath)
  else void window.loadURL(emptyShellURL())
}

import { basename, dirname } from 'node:path'

import { Menu, type MenuItemConstructorOptions } from 'electron'

import { editorMenu, type MenuEntry, type MenuGroup } from './menu-model'

const EDIT_ROLES = {
  copy: 'copy',
  cut: 'cut',
  paste: 'paste',
  'selection.selectAll': 'selectAll'
} as const

type EditRole = (typeof EDIT_ROLES)[keyof typeof EDIT_ROLES]

function editRole(id: string | undefined): EditRole | undefined {
  switch (id) {
    case 'copy':
    case 'cut':
    case 'paste':
    case 'selection.selectAll':
      return EDIT_ROLES[id]
    default:
      return undefined
  }
}

export interface MenuHandlers {
  onAction: (id: string, checked?: boolean) => void
}

export interface MenuController {
  setFeatures(features: readonly string[]): void
  setChecked(id: string, checked: boolean): void
  setRecent(paths: readonly string[]): void
}

function recentLabel(filePath: string): string {
  const name = basename(filePath)
  const parent = basename(dirname(filePath))
  if (parent.length === 0 || parent === name) return name
  return `${name} — ${parent}`
}

function itemTemplate(
  entry: MenuEntry,
  handlers: MenuHandlers,
  checked: Map<string, boolean>,
  recent: readonly string[]
): MenuItemConstructorOptions | null {
  if (entry.type === 'separator') return { type: 'separator' }
  if (!entry.label) return null
  if (entry.id === 'open-recent') return recentMenu(entry.label, handlers, recent)
  if (entry.sub && entry.sub.length > 0) {
    const submenu = entry.sub.flatMap((child) => {
      const item = itemTemplate(child, handlers, checked, recent)
      return item ? [item] : []
    })
    return { label: entry.label, submenu }
  }
  const id = entry.id
  const checkbox = entry.checkbox === true
  const role = editRole(id)
  return {
    id,
    label: entry.label,
    accelerator: entry.accelerator,
    type: checkbox ? 'checkbox' : 'normal',
    checked: checkbox ? (id ? (checked.get(id) ?? true) : true) : undefined,
    role,
    click: (item) => {
      if (!id) return
      if (checkbox) {
        checked.set(id, item.checked)
        handlers.onAction(id, item.checked)
        return
      }
      handlers.onAction(id)
    }
  }
}

function recentMenu(
  label: string,
  handlers: MenuHandlers,
  recent: readonly string[]
): MenuItemConstructorOptions {
  if (recent.length === 0) {
    return {
      label,
      submenu: [{ label: 'No Recent Files', enabled: false }]
    }
  }
  const submenu: MenuItemConstructorOptions[] = recent.map((filePath, index) => ({
    id: `open-recent:${index}`,
    label: recentLabel(filePath),
    click: () => {
      handlers.onAction(`open-recent:${index}`)
    }
  }))
  submenu.push(
    { type: 'separator' },
    {
      id: 'clear-recent-files',
      label: 'Clear Menu',
      click: () => handlers.onAction('clear-recent-files')
    }
  )
  return { id: 'open-recent', label, submenu }
}

function groupTemplate(
  group: MenuGroup,
  handlers: MenuHandlers,
  checked: Map<string, boolean>,
  recent: readonly string[]
): MenuItemConstructorOptions {
  return {
    label: group.label,
    submenu: group.items.flatMap((entry) => {
      const item = itemTemplate(entry, handlers, checked, recent)
      return item ? [item] : []
    })
  }
}

function appMenu(handlers: MenuHandlers): MenuItemConstructorOptions {
  return {
    label: 'OpenPencil',
    submenu: [
      { label: 'About OpenPencil', click: () => handlers.onAction('about') },
      { label: 'Check for Updates…', click: () => handlers.onAction('check-updates') },
      { type: 'separator' },
      {
        label: 'Settings…',
        accelerator: 'CmdOrCtrl+,',
        click: () => handlers.onAction('settings')
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      {
        label: 'Quit OpenPencil',
        accelerator: 'CmdOrCtrl+Q',
        click: () => handlers.onAction('quit')
      }
    ]
  }
}

export function installApplicationMenu(handlers: MenuHandlers): MenuController {
  const features: string[] = []
  const checked = new Map<string, boolean>()
  let recent: string[] = []

  function rebuild(): void {
    const template: MenuItemConstructorOptions[] = []
    if (process.platform === 'darwin') template.push(appMenu(handlers))
    for (const group of editorMenu({ features, platform: process.platform })) {
      template.push(groupTemplate(group, handlers, checked, recent))
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  rebuild()
  return {
    setFeatures(next) {
      features.splice(0, features.length, ...next)
      rebuild()
    },
    setChecked(id, value) {
      checked.set(id, value)
      rebuild()
    },
    setRecent(paths) {
      recent = [...paths]
      rebuild()
    }
  }
}

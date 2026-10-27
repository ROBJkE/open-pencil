import { editorCommandMetadata, formatShortcut } from '@open-pencil/vue/editor/commands'

import type { AppMenuActionItem, AppMenuEntry } from '@/app/shell/menu/schema'
import { APP_MENU_SCHEMA } from '@/app/shell/menu/schema'

function isActionItem(entry: AppMenuEntry): entry is AppMenuActionItem {
  return !('type' in entry && entry.type === 'separator')
}

function findShortcutInEntries(entries: readonly AppMenuEntry[], id: string): string | undefined {
  for (const entry of entries) {
    if (!isActionItem(entry)) continue
    if (entry.id === id)
      return (
        entry.shortcut ??
        (entry.command ? editorCommandMetadata(entry.command).shortcut : undefined)
      )
    const shortcut = entry.sub ? findShortcutInEntries(entry.sub, id) : undefined
    if (shortcut) return shortcut
  }
  return undefined
}

export function appMenuShortcut(id: string): string | undefined {
  for (const group of APP_MENU_SCHEMA) {
    const shortcut = findShortcutInEntries(group.items, id)
    if (shortcut) return shortcut
  }
  return undefined
}

function normalizeShortcutToken(shortcut: string): string {
  return shortcut === '⌫'
    ? 'Backspace'
    : shortcut.replaceAll('↩', 'Enter').replaceAll('⇞', 'PageUp').replaceAll('⇟', 'PageDown')
}

/**
 * A letter becomes its key code, which the keyboard registry matches by layout (`shortcutCode`).
 * A quote becomes `Quote`, because Shift turns `'` into `"`.
 */
export function shortcutTokenToTinykeys(shortcut: string | undefined): string | undefined {
  return shortcut
    ? normalizeShortcutToken(shortcut)
        .replaceAll('MOD', '$mod')
        .replaceAll('SHIFT', 'Shift')
        .replaceAll('ALT', 'Alt')
        .replaceAll("'", 'Quote')
        .replace(/(^|\+)([A-Z])$/, '$1Key$2')
    : undefined
}

/**
 * The OS may own a shortcut only when it includes the command modifier. Any other chord types
 * or edits, and the webview keyboard handler owns it so a text field can see the key.
 */
export function shortcutTokenToAccelerator(shortcut: string | undefined): string | undefined {
  if (!shortcut?.split('+').includes('MOD')) return undefined
  return normalizeShortcutToken(shortcut)
    .replaceAll('MOD', 'CmdOrCtrl')
    .replaceAll('SHIFT', 'Shift')
    .replaceAll('ALT', 'Alt')
}

const NATIVE_COMMAND_MODIFIERS = new Set(['CmdOrCtrl', 'Cmd', 'Ctrl', 'Command', 'Control'])

/** An accelerator string the OS may install. Tokens are converted first. */
export function nativeMenuAccelerator(accelerator: string | undefined): string | undefined {
  if (!accelerator) return undefined
  return accelerator.split('+').some((part) => NATIVE_COMMAND_MODIFIERS.has(part))
    ? accelerator
    : undefined
}

export function appMenuShortcutLabel(id: string): string | undefined {
  return formatShortcut(appMenuShortcut(id))
}

export function appMenuTinykeysShortcut(id: string): string | undefined {
  return shortcutTokenToTinykeys(appMenuShortcut(id))
}

export function appMenuAccelerator(id: string): string | undefined {
  return shortcutTokenToAccelerator(appMenuShortcut(id))
}

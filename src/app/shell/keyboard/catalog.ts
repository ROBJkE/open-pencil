import {
  EDITOR_COMMAND_METADATA,
  type EditorCommandId,
  type EditorCommandMetadata
} from '@open-pencil/vue/editor/commands'

import type { AppMenuActionItem, AppMenuEntry } from '@/app/shell/menu/schema'
import { APP_MENU_SCHEMA } from '@/app/shell/menu/schema'
import { shortcutTokenToTinykeys } from '@/app/shell/menu/shortcut'

export type WebviewShortcut = {
  id: string
  keys: string[]
}

/** A binding the OS may own. Anything else must reach a focused text field. */
export function isCommandChordBinding(keys: string): boolean {
  const parts = new Set(keys.split('+'))
  return parts.has('$mod') || parts.has('Meta') || parts.has('Control') || parts.has('Ctrl')
}

function commandMetadata(): [EditorCommandId, EditorCommandMetadata][] {
  return Object.entries(EDITOR_COMMAND_METADATA) as [EditorCommandId, EditorCommandMetadata][]
}

/** Command shortcuts that type or edit, taken from command metadata. */
export function bareCommandKeybindings(): (WebviewShortcut & { id: EditorCommandId })[] {
  const shortcuts: (WebviewShortcut & { id: EditorCommandId })[] = []
  for (const [id, meta] of commandMetadata()) {
    const keys = [meta.keybinding ?? []].flat().filter((key) => !isCommandChordBinding(key))
    if (keys.length > 0) shortcuts.push({ id, keys })
  }
  return shortcuts
}

function isActionItem(entry: AppMenuEntry): entry is AppMenuActionItem {
  return !('type' in entry && entry.type === 'separator')
}

function menuActions(entries: readonly AppMenuEntry[]): AppMenuActionItem[] {
  return entries.flatMap((entry) =>
    isActionItem(entry) ? [entry, ...menuActions(entry.sub ?? [])] : []
  )
}

/**
 * Menu shortcuts that are not editor commands and do not include the command modifier.
 * Their keys come from the menu schema.
 */
export function bareMenuKeybindings(): WebviewShortcut[] {
  const shortcuts: WebviewShortcut[] = []
  for (const group of APP_MENU_SCHEMA) {
    for (const entry of menuActions(group.items)) {
      if (entry.command || !entry.shortcut || entry.shortcut.split('+').includes('MOD')) continue
      const keys = shortcutTokenToTinykeys(entry.shortcut)
      if (keys) shortcuts.push({ id: entry.id, keys: [keys] })
    }
  }
  return shortcuts
}

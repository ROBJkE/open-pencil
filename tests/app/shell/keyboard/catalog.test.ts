import { describe, expect, test } from 'bun:test'

import {
  EDITOR_COMMAND_METADATA,
  editorCommandMetadata,
  type EditorCommandId
} from '@open-pencil/vue/editor/commands'

import { editorShortcutDefinitions } from '@/app/shell/keyboard/registry'
import type { AppMenuActionItem, AppMenuEntry } from '@/app/shell/menu/schema'
import { APP_MENU_SCHEMA } from '@/app/shell/menu/schema'
import { shortcutTokenToTinykeys } from '@/app/shell/menu/shortcut'

function isActionItem(entry: AppMenuEntry): entry is AppMenuActionItem {
  return !('type' in entry && entry.type === 'separator')
}

function menuActions(entries: readonly AppMenuEntry[]): AppMenuActionItem[] {
  return entries.flatMap((entry) =>
    isActionItem(entry) ? [entry, ...menuActions(entry.sub ?? [])] : []
  )
}

/** A key the webview must bind because the OS accelerator cannot see a text field. */
function bareKeybinding(keys: string | string[] | undefined): string[] {
  return [keys ?? []].flat().filter((key) => {
    const parts = new Set(key.split('+'))
    return !parts.has('$mod') && !parts.has('Meta') && !parts.has('Control') && !parts.has('Ctrl')
  })
}

function boundKeys(): Map<string, Set<string>> {
  const bound = new Map<string, Set<string>>()
  for (const shortcut of editorShortcutDefinitions()) {
    const keys = bound.get(shortcut.id) ?? new Set<string>()
    for (const key of [shortcut.keys].flat()) keys.add(key)
    bound.set(shortcut.id, keys)
  }
  return bound
}

describe('webview shortcut catalog', () => {
  const bound = boundKeys()

  test('binds every command shortcut that is not a command chord', () => {
    for (const [id, meta] of Object.entries(EDITOR_COMMAND_METADATA) as [
      EditorCommandId,
      (typeof EDITOR_COMMAND_METADATA)[EditorCommandId]
    ][]) {
      for (const key of bareKeybinding(meta.keybinding)) {
        expect(bound.get(id)?.has(key), `${id} ${key}`).toBe(true)
      }
    }
  })

  test('binds every menu shortcut that is not a command chord', () => {
    for (const group of APP_MENU_SCHEMA) {
      for (const entry of menuActions(group.items)) {
        const token =
          entry.shortcut ??
          (entry.command ? editorCommandMetadata(entry.command).shortcut : undefined)
        if (!token || token.split('+').includes('MOD')) continue
        if (entry.command) {
          const keys = bareKeybinding(editorCommandMetadata(entry.command).keybinding)
          expect(keys.length, entry.command).toBeGreaterThan(0)
          for (const key of keys) expect(bound.get(entry.command)?.has(key), key).toBe(true)
          continue
        }
        const key = shortcutTokenToTinykeys(token)
        expect(key, entry.id).toBeDefined()
        expect(bound.get(entry.id)?.has(key ?? ''), entry.id).toBe(true)
      }
    }
  })

  test('registers each key once', () => {
    const seen = new Map<string, string>()
    for (const shortcut of editorShortcutDefinitions()) {
      for (const key of [shortcut.keys].flat()) {
        expect(seen.get(key), key).toBeUndefined()
        seen.set(key, shortcut.id)
      }
    }
  })
})

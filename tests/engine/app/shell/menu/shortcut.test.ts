import { describe, expect, test } from 'bun:test'

import {
  appMenuAccelerator,
  appMenuShortcut,
  nativeMenuAccelerator,
  shortcutTokenToAccelerator,
  shortcutTokenToTinykeys
} from '@/app/shell/menu/shortcut'

describe('app menu shortcut conversion', () => {
  test('looks up canonical shortcut tokens from the menu schema', () => {
    expect(appMenuShortcut('save-as')).toBe('MOD+SHIFT+S')
    expect(appMenuShortcut('selection.createComponent')).toBe('MOD+ALT+K')
  })

  test('converts shortcut tokens to tinykeys bindings', () => {
    expect(shortcutTokenToTinykeys('MOD+SHIFT+S')).toBe('$mod+Shift+KeyS')
    expect(shortcutTokenToTinykeys('ALT+Delete')).toBe('Alt+Delete')
    expect(shortcutTokenToTinykeys('⌫')).toBe('Backspace')
    expect(shortcutTokenToTinykeys("SHIFT+'")).toBe('Shift+Quote')
  })

  test('converts command chords to native accelerators', () => {
    expect(shortcutTokenToAccelerator('MOD+SHIFT+S')).toBe('CmdOrCtrl+Shift+S')
    expect(shortcutTokenToAccelerator('MOD+S')).toBe('CmdOrCtrl+S')
    expect(shortcutTokenToAccelerator('ALT+A')).toBeUndefined()
    expect(shortcutTokenToAccelerator('N')).toBeUndefined()
    expect(shortcutTokenToAccelerator('⌫')).toBeUndefined()
    expect(shortcutTokenToAccelerator('SHIFT+N')).toBeUndefined()
    expect(shortcutTokenToAccelerator('ALT+SHIFT+U')).toBeUndefined()
    expect(nativeMenuAccelerator('CmdOrCtrl+Alt+I')).toBe('CmdOrCtrl+Alt+I')
    expect(nativeMenuAccelerator('Backspace')).toBeUndefined()
  })

  test('derives native accelerators from menu ids', () => {
    expect(appMenuAccelerator('save-as')).toBe('CmdOrCtrl+Shift+S')
    expect(appMenuAccelerator('selection.delete')).toBeUndefined()
    expect(appMenuAccelerator('view.zoomNextFrame')).toBeUndefined()
  })
})

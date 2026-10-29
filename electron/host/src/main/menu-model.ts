import * as v from 'valibot'

import menuJSON from './menu.json'

const menuEntrySchema: v.GenericSchema<MenuEntry> = v.lazy(() =>
  v.union([
    v.object({
      type: v.literal('separator'),
      feature: v.optional(v.string())
    }),
    v.object({
      id: v.string(),
      label: v.string(),
      accelerator: v.optional(v.string()),
      checkbox: v.optional(v.boolean()),
      feature: v.optional(v.string()),
      sub: v.optional(v.array(menuEntrySchema))
    })
  ])
)

const menuFileSchema = v.array(
  v.object({
    label: v.string(),
    items: v.array(menuEntrySchema)
  })
)

export type MenuEntry = {
  type?: 'separator'
  id?: string
  label?: string
  accelerator?: string
  checkbox?: boolean
  feature?: string
  sub?: MenuEntry[]
}

export interface MenuGroup {
  label: string
  items: MenuEntry[]
}

const CHAT_ITEM: MenuEntry = {
  id: 'toggle-ai',
  label: 'Toggle Chat',
  accelerator: 'CmdOrCtrl+J'
}

let cached: MenuGroup[] | null = null

function sourceMenu(): MenuGroup[] {
  if (cached) return cached
  const parsed = v.safeParse(
    v.pipe(v.string(), v.parseJson(), menuFileSchema),
    JSON.stringify(menuJSON)
  )
  if (!parsed.success) {
    console.error('Application menu data is invalid')
    cached = [
      {
        label: 'File',
        items: [
          { id: 'new', label: 'New', accelerator: 'CmdOrCtrl+N' },
          { id: 'open', label: 'Open…', accelerator: 'CmdOrCtrl+O' },
          { id: 'save', label: 'Save', accelerator: 'CmdOrCtrl+S' },
          { id: 'quit', label: 'Quit OpenPencil', accelerator: 'CmdOrCtrl+Q' }
        ]
      }
    ]
    return cached
  }
  cached = parsed.output
  return cached
}

function cloneEntry(entry: MenuEntry): MenuEntry {
  return {
    ...entry,
    ...(entry.sub ? { sub: entry.sub.map(cloneEntry) } : {})
  }
}

function withChat(items: MenuEntry[]): MenuEntry[] {
  if (items.some((item) => item.id === 'toggle-ai')) return items
  const next: MenuEntry[] = []
  let inserted = false
  for (const item of items) {
    if (item.id === 'dev-tools' && !inserted) {
      next.push(CHAT_ITEM)
      inserted = true
    }
    next.push(item)
  }
  if (!inserted) next.push(CHAT_ITEM)
  return next
}

function visibleEntries(items: readonly MenuEntry[], features: ReadonlySet<string>): MenuEntry[] {
  const kept: MenuEntry[] = []
  for (const entry of items) {
    if (entry.feature && !features.has(entry.feature)) continue
    const next = entry.sub ? { ...entry, sub: visibleEntries(entry.sub, features) } : { ...entry }
    if (
      next.type === 'separator' &&
      (kept.length === 0 || kept[kept.length - 1]?.type === 'separator')
    ) {
      continue
    }
    kept.push(next)
  }
  while (kept[kept.length - 1]?.type === 'separator') kept.pop()
  return kept
}

export interface EditorMenuOptions {
  features?: readonly string[]
  platform?: string
}

/** Native menu matching the current app, plus the chat shortcut. */
export function editorMenu(options: EditorMenuOptions = {}): MenuGroup[] {
  const features = new Set<string>()
  if (options.features) {
    for (const feature of options.features) features.add(feature)
  }
  const platform = options.platform ?? 'linux'
  const groups = sourceMenu().map((group) => ({
    label: group.label,
    items: group.items.map(cloneEntry)
  }))
  for (const group of groups) {
    if (group.label === 'View') group.items = withChat(group.items)
    group.items = visibleEntries(group.items, features)
    if (platform === 'darwin' && group.label === 'File') {
      group.items = group.items.filter((item) => item.id !== 'settings')
      while (group.items[group.items.length - 1]?.type === 'separator') group.items.pop()
    }
    if (platform !== 'darwin' && group.label === 'File') {
      group.items.push(
        { type: 'separator' },
        { id: 'check-updates', label: 'Check for Updates…' },
        { id: 'quit', label: 'Quit OpenPencil', accelerator: 'CmdOrCtrl+Q' }
      )
    }
  }
  return groups
}

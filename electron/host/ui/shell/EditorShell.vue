<script setup lang="ts">
import type { HostEvent } from '#host/main/host-events'
import { useEventListener } from '@vueuse/core'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { computed, onScopeDispose, provide, ref, watch } from 'vue'

import type { CanvasTool, Command } from '@open-pencil/session'
import { useSession } from '@open-pencil/vue-next'

import { subscribeHost } from '../session/bridge'
import { applyShellTheme, type ShellTheme } from '../session/theme'
import CanvasSurface from './CanvasSurface.vue'
import {
  ACTIONS_KEY,
  BUMP_KEY,
  DOCUMENT_KEY,
  REVISION_KEY,
  THEME_KEY,
  TOOL_KEY,
  VIEW_KEY,
  useWindowBridge,
  type ShellActions
} from './context'
import LayersPanel from './LayersPanel.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import SettingsDialog from './SettingsDialog.vue'
import { documentSlotAvailable, type DocumentTab } from './tabs'
import TabStrip from './TabStrip.vue'
import { useDocumentView } from './useDocumentView'

const session = useSession()
const bridge = useWindowBridge()
const tabs = ref<DocumentTab[]>([])
const activeId = ref('')
const tool = ref<CanvasTool>('select')
const theme = ref<ShellTheme>('dark')
const settingsOpen = ref(false)
const revision = ref(0)
const opening = ref(0)
const ensured = new Set<string>()
let untitled = 0
let requestedDocument = false

const documentId = computed(() => activeId.value)
const activeTool = computed(() => tool.value)
const shellTheme = computed(() => theme.value)
const documentName = computed(() => tabs.value.find((tab) => tab.id === activeId.value)?.name ?? '')
const canCreate = computed(() =>
  documentSlotAvailable(tabs.value.length, opening.value, session.supervisor.documentCap)
)
const view = useDocumentView(documentId)

function bump(): void {
  revision.value += 1
  void view.refresh()
}

async function submit(command: Command): Promise<void> {
  if (!activeId.value) return
  await session.submit(activeId.value, command)
  bump()
}

function remember(tab: DocumentTab): void {
  const index = tabs.value.findIndex((item) => item.id === tab.id)
  if (index === -1) {
    tabs.value = [...tabs.value, tab]
  } else {
    const next = tabs.value.slice()
    const current = next[index]
    if (current) next[index] = { id: current.id, name: tab.name }
    tabs.value = next
  }
  activeId.value = tab.id
  void ensurePage(tab.id)
}

function forget(id: string): void {
  ensured.delete(id)
  const next: DocumentTab[] = []
  for (const tab of tabs.value) {
    if (tab.id !== id) next.push(tab)
  }
  tabs.value = next
  if (activeId.value !== id) return
  activeId.value = next[0]?.id ?? ''
}

function fileName(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function nextUntitledName(): string {
  untitled += 1
  return untitled === 1 ? 'Untitled' : `Untitled ${untitled}`
}

async function ensurePage(id: string): Promise<void> {
  if (ensured.has(id)) return
  ensured.add(id)
  const roots = await session.layerTree(id, { parentId: null, offset: 0, limit: 1 })
  if (roots.total > 0) return
  const pageId = crypto.randomUUID()
  await session.submit(id, {
    type: 'create',
    parentId: null,
    index: 0,
    node: { id: pageId, type: 'page', fields: { name: 'Page 1' } }
  })
  await session.submit(id, { type: 'set-expanded', id: pageId, expanded: false })
  if (activeId.value === id) bump()
}

async function createTab(): Promise<void> {
  if (!canCreate.value) return
  opening.value += 1
  const name = nextUntitledName()
  try {
    const id = await session.openDocument({ name })
    remember({ id, name })
  } catch (error) {
    console.warn('open failed', error)
  } finally {
    opening.value -= 1
  }
}

async function closeTab(id: string): Promise<void> {
  if (tabs.value.length <= 1) return
  try {
    await session.closeDocument(id)
  } catch (error) {
    console.warn('close failed', error)
  }
}

async function addPage(): Promise<void> {
  const id = activeId.value
  if (!id) return
  const pageId = crypto.randomUUID()
  const index = view.pageCount.value
  await session.submit(id, {
    type: 'create',
    parentId: null,
    index,
    node: { id: pageId, type: 'page', fields: { name: `Page ${index + 1}` } }
  })
  await session.submit(id, { type: 'set-expanded', id: pageId, expanded: false })
  bump()
}

async function zoomBy(factor: number): Promise<void> {
  const current = view.viewport.value
  await submit({
    type: 'set-viewport',
    zoom: current.zoom * factor,
    panX: current.panX,
    panY: current.panY,
    width: current.width,
    height: current.height
  })
}

const actions: ShellActions = {
  newTab() {
    void createTab()
  },
  closeTab() {
    void closeTab(activeId.value)
  },
  openFile() {
    void bridge.openFile().catch((error: unknown) => {
      console.warn('open failed', error)
    })
  },
  saveFile() {
    const id = activeId.value
    if (!id) return
    void bridge
      .activate(id)
      .then(() => bridge.saveFile())
      .catch((error: unknown) => {
        console.warn('save failed', error)
      })
  },
  openSettings() {
    settingsOpen.value = true
  },
  undo() {
    void submit({ type: 'undo' })
  },
  redo() {
    void submit({ type: 'redo' })
  },
  zoomIn() {
    void zoomBy(1.25)
  },
  zoomOut() {
    void zoomBy(0.8)
  },
  setTheme(next) {
    theme.value = next
    applyShellTheme(next)
  },
  removeSelection() {
    const ids = [...view.selection.value.ids]
    if (ids.length === 0) return
    void submit({ type: 'delete', ids })
  },
  select(id) {
    void submit({ type: 'set-selection', ids: [id] })
  },
  expand(id, expanded) {
    void submit({ type: 'set-expanded', id, expanded })
  },
  removeNode(id) {
    void submit({ type: 'delete', ids: [id] })
  },
  addPage() {
    void addPage()
  },
  setTool(next) {
    tool.value = next
    void submit({ type: 'set-tool', tool: next })
  }
}

function openUntitled(): void {
  if (requestedDocument) return
  requestedDocument = true
  void createTab().finally(() => {
    if (tabs.value.length === 0) requestedDocument = false
  })
}

function replaceDocuments(event: Extract<HostEvent, { type: 'documents' }>): void {
  tabs.value = event.documents.map((document) => ({ id: document.id, name: document.name }))
  const ids = new Set(tabs.value.map((tab) => tab.id))
  for (const id of ensured) if (!ids.has(id)) ensured.delete(id)
  if (tabs.value.length === 0) {
    openUntitled()
    return
  }
  const requested = event.activeId
  activeId.value = requested && ids.has(requested) ? requested : (tabs.value[0]?.id ?? '')
  for (const tab of tabs.value) void ensurePage(tab.id)
}

function onMenu(id: string): void {
  if (id === 'edit.undo') actions.undo()
  else if (id === 'edit.redo') actions.redo()
  else if (id === 'zoom-in') actions.zoomIn()
  else if (id === 'zoom-out') actions.zoomOut()
  else if (id === 'selection.delete') actions.removeSelection()
  else if (id === 'settings') actions.openSettings()
  else if (id === 'theme-light') actions.setTheme('light')
  else if (id === 'theme-dark') actions.setTheme('dark')
}

const stopHost = subscribeHost(bridge, (event) => {
  if (event.type === 'documents') {
    replaceDocuments(event)
    return
  }
  if (event.type === 'document-opened') {
    remember({ id: event.id, name: event.name })
    return
  }
  if (event.type === 'document-closed') {
    forget(event.id)
    return
  }
  if (event.type === 'document-saved') {
    const name = fileName(event.path)
    tabs.value = tabs.value.map((tab) => (tab.id === event.id ? { id: tab.id, name } : tab))
    return
  }
  if (event.type === 'menu') onMenu(event.id)
})
onScopeDispose(stopHost)

provide(DOCUMENT_KEY, documentId)
provide(VIEW_KEY, view)
provide(
  REVISION_KEY,
  computed(() => revision.value)
)
provide(BUMP_KEY, bump)
provide(ACTIONS_KEY, actions)
provide(TOOL_KEY, activeTool)
provide(THEME_KEY, shellTheme)

watch(activeId, (id) => {
  if (!id) return
  void bridge.activate(id).catch((error: unknown) => {
    console.warn('activate failed', error)
  })
})

watch(shellTheme, (next) => {
  applyShellTheme(next)
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    return
  if (!(event.metaKey || event.ctrlKey) || event.code !== 'KeyZ') return
  event.preventDefault()
  void submit(event.shiftKey ? { type: 'redo' } : { type: 'undo' })
})
</script>

<template>
  <div data-test-id="editor-shell" class="flex h-screen w-screen flex-col bg-canvas text-surface">
    <TabStrip
      :tabs="tabs"
      :active-id="activeId"
      :disabled="!canCreate"
      @select="activeId = $event"
      @close="closeTab"
      @create="createTab"
    />
    <SplitterGroup direction="horizontal" class="min-h-0 flex-1 overflow-hidden">
      <SplitterPanel :default-size="20" :min-size="12" :max-size="32" class="flex min-w-0">
        <LayersPanel :document-name="documentName" />
      </SplitterPanel>
      <SplitterResizeHandle
        class="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none focus-visible:ring-1 focus-visible:ring-panel-focus"
      >
        <div
          class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-data-[state=drag]:bg-accent group-data-[state=hover]:bg-accent group-focus-visible:bg-accent"
        />
      </SplitterResizeHandle>
      <SplitterPanel :default-size="58" :min-size="30" class="flex min-w-0">
        <CanvasSurface />
      </SplitterPanel>
      <SplitterResizeHandle
        class="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none focus-visible:ring-1 focus-visible:ring-panel-focus"
      >
        <div
          class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-data-[state=drag]:bg-accent group-data-[state=hover]:bg-accent group-focus-visible:bg-accent"
        />
      </SplitterResizeHandle>
      <SplitterPanel :default-size="22" :min-size="16" :max-size="36" class="flex min-w-0">
        <PropertiesPanel />
      </SplitterPanel>
    </SplitterGroup>
    <SettingsDialog v-model:open="settingsOpen" />
  </div>
</template>

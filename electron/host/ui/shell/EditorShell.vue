<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, provide, ref, watch } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'

import type { CanvasTool, Command } from '@open-pencil/session'
import { useSession } from '@open-pencil/vue-next'

import { applyShellTheme, type ShellTheme } from '../session/theme'
import CanvasPlaceholder from './CanvasPlaceholder.vue'
import {
  ACTIONS_KEY,
  BUMP_KEY,
  DOCUMENT_KEY,
  REVISION_KEY,
  THEME_KEY,
  TOOL_KEY,
  VIEW_KEY,
  type ShellActions
} from './context'
import LayersPanel from './LayersPanel.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import SettingsDialog from './SettingsDialog.vue'
import TabStrip from './TabStrip.vue'
import { closeDocumentTab, documentSlotAvailable, nextDocument, type DocumentTab } from './tabs'
import { useDocumentView } from './useDocumentView'

const { initialTabs } = defineProps<{ initialTabs: DocumentTab[] }>()

const session = useSession()
const tabs = ref<DocumentTab[]>(initialTabs.map((tab) => ({ id: tab.id, name: tab.name })))
const activeId = ref(tabs.value[0]?.id ?? '')
const tool = ref<CanvasTool>('select')
const theme = ref<ShellTheme>('dark')
const settingsOpen = ref(false)
const revision = ref(0)
let serial = tabs.value.length
let opening = 0

const documentId = computed(() => activeId.value)
const activeTool = computed(() => tool.value)
const shellTheme = computed(() => theme.value)
const documentName = computed(
  () => tabs.value.find((tab) => tab.id === activeId.value)?.name ?? ''
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

const actions: ShellActions = {
  newTab() {
    void createTab()
  },
  closeTab() {
    void closeActive()
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
    void submit({
      type: 'create',
      parentId: null,
      index: view.pageCount.value,
      node: { type: 'page', fields: { name: `Page ${view.pageCount.value + 1}` } }
    })
  },
  setTool(next) {
    tool.value = next
    void submit({ type: 'set-tool', tool: next })
  }
}

async function createTab(): Promise<void> {
  if (!documentSlotAvailable(tabs.value.length, opening, session.supervisor.documentCap)) return
  opening += 1
  const created = nextDocument(serial)
  serial = created.serial
  try {
    await session.openDocument(created.tab)
    tabs.value = [...tabs.value, created.tab]
    activeId.value = created.tab.id
  } finally {
    opening -= 1
  }
}

async function closeActive(): Promise<void> {
  await closeTab(activeId.value)
}

async function closeTab(id: string): Promise<void> {
  const next = closeDocumentTab(tabs.value, id, activeId.value)
  if (!next) return
  await session.closeDocument(id)
  tabs.value = next.tabs
  activeId.value = next.activeId
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

provide(DOCUMENT_KEY, documentId)
provide(VIEW_KEY, view)
provide(REVISION_KEY, computed(() => revision.value))
provide(BUMP_KEY, bump)
provide(ACTIONS_KEY, actions)
provide(TOOL_KEY, activeTool)
provide(THEME_KEY, shellTheme)

watch(shellTheme, (next) => {
  applyShellTheme(next)
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
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
        <CanvasPlaceholder />
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

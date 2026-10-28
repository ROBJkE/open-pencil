<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { ref } from 'vue'

import { messages } from './messages'
import AppMenu from './AppMenu.vue'
import LayerTree from './LayerTree.vue'
import PageList from './PageList.vue'
import { useDocumentProjection } from './context'

const { documentName } = defineProps<{ documentName: string }>()

const panel = ref<'file' | 'assets'>('file')
const view = useDocumentProjection()

function choose(next: 'file' | 'assets'): void {
  panel.value = next
}
</script>

<template>
  <aside
    data-test-id="layers-panel"
    class="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border bg-panel"
  >
    <AppMenu :document-name="documentName" />
    <div class="shrink-0 border-b border-border px-2 py-1.5">
      <div
        class="inline-flex w-full items-center gap-0.5 rounded bg-panel-field p-0.5"
        role="tablist"
        :aria-label="messages.layers"
      >
        <button
          type="button"
          role="tab"
          data-test-id="left-panel-layers-tab"
          class="flex h-5 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-sm px-1.5 text-[11px] text-muted outline-none hover:bg-hover hover:text-surface data-[state=on]:bg-hover data-[state=on]:text-surface"
          :data-state="panel === 'file' ? 'on' : 'off'"
          :aria-selected="panel === 'file'"
          @click="choose('file')"
        >
          {{ messages.file }}
        </button>
        <button
          type="button"
          role="tab"
          data-test-id="left-panel-assets-tab"
          class="flex h-5 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-sm px-1.5 text-[11px] text-muted outline-none hover:bg-hover hover:text-surface data-[state=on]:bg-hover data-[state=on]:text-surface"
          :data-state="panel === 'assets' ? 'on' : 'off'"
          :aria-selected="panel === 'assets'"
          @click="choose('assets')"
        >
          {{ messages.assets }}
        </button>
      </div>
    </div>
    <div
      v-if="panel === 'assets'"
      class="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted"
    >
      {{ messages.noAssets }}
    </div>
    <SplitterGroup v-else direction="vertical" class="min-h-0 flex-1 overflow-hidden">
      <SplitterPanel :default-size="30" :min-size="10" :max-size="60" class="flex flex-col overflow-hidden">
        <PageList :page-count="view.pageCount.value" :total="view.total.value" :page-id="view.viewport.value.pageId" />
      </SplitterPanel>
      <SplitterResizeHandle
        class="group relative z-10 -my-1 h-2 shrink-0 cursor-row-resize touch-none outline-none focus-visible:ring-1 focus-visible:ring-panel-focus"
      >
        <div
          class="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-data-[state=drag]:bg-accent group-data-[state=hover]:bg-accent group-focus-visible:bg-accent"
        />
      </SplitterResizeHandle>
      <SplitterPanel :default-size="70" :min-size="20" class="flex flex-col overflow-hidden">
        <LayerTree :page-count="view.pageCount.value" :total="view.total.value" :page-id="view.viewport.value.pageId" />
      </SplitterPanel>
    </SplitterGroup>
  </aside>
</template>

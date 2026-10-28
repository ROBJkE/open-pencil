<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger
} from 'reka-ui'

import type { LayerRow } from '@open-pencil/session'

import { useMenuUI } from '../menu/menu'
import { messages } from './messages'
import { useShellActions } from './context'
import VirtualRows from './VirtualRows.vue'

const { pageCount, total, pageId } = defineProps<{
  pageCount: number
  total: number
  pageId: string | null
}>()

const actions = useShellActions()
const menu = useMenuUI({ content: 'min-w-36', item: 'justify-start gap-2' })

function pad(row: LayerRow): string {
  return `${8 + row.depth * 12}px`
}

function rowClass(row: LayerRow): string {
  const tone = row.selected
    ? 'bg-panel-selected text-on-accent hover:bg-panel-selected'
    : 'bg-transparent text-surface hover:bg-hover'
  return row.visible ? tone : `${tone} opacity-40`
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <header data-test-id="layers-header" class="shrink-0 px-3 py-2 text-[11px] font-semibold text-surface">
      {{ messages.layers }}
    </header>
    <VirtualRows
      class="min-h-0 flex-1"
      kind="layers"
      :page-count="pageCount"
      :total="total"
      :page-id="pageId"
    >
      <template #default="{ rows }">
        <div v-if="rows.length === 0" class="px-3 py-2 text-[11px] text-muted">{{ messages.noLayers }}</div>
        <div v-else role="tree" :aria-label="messages.layers">
          <ContextMenuRoot v-for="row in rows" :key="row.id" :modal="false">
            <ContextMenuTrigger as-child>
              <div
                role="treeitem"
                :aria-selected="row.selected"
                class="flex w-full cursor-pointer items-center gap-1 rounded border-none pr-1 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-panel-focus"
                :class="rowClass(row)"
                :style="{ height: '24px', paddingLeft: pad(row) }"
                @click="actions.select(row.id)"
              >
                <button
                  v-if="row.childCount > 0"
                  type="button"
                  class="flex w-4 shrink-0 items-center justify-center text-current"
                  :aria-label="row.expanded ? messages.collapseLayer : messages.expandLayer"
                  @click.stop="actions.expand(row.id, !row.expanded)"
                >
                  <icon-lucide-chevron-right class="size-3" :class="row.expanded ? 'rotate-90' : 'rotate-0'" />
                </button>
                <span v-else class="w-4 shrink-0" />
                <icon-lucide-frame v-if="row.type === 'frame'" class="size-3 shrink-0 opacity-70" />
                <icon-lucide-square v-else class="size-3 shrink-0 opacity-70" />
                <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuPortal>
              <ContextMenuContent :class="menu.content">
                <ContextMenuItem :class="menu.item" @select="actions.select(row.id)">
                  {{ messages.select }}
                </ContextMenuItem>
                <ContextMenuItem :class="menu.item" @select="actions.removeNode(row.id)">
                  {{ messages.delete }}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenuPortal>
          </ContextMenuRoot>
        </div>
      </template>
    </VirtualRows>
  </section>
</template>

<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger
} from 'reka-ui'

import IconButton from '../button/IconButton.vue'
import { useMenuUI } from '../menu/menu'
import { useShellActions } from './context'
import { messages } from './messages'
import VirtualRows from './VirtualRows.vue'

const { total, pageId } = defineProps<{
  total: number
  pageId: string | null
}>()

const actions = useShellActions()
const menu = useMenuUI({ content: 'min-w-36', item: 'justify-start gap-2' })

function itemClass(active: boolean): string {
  return active
    ? 'bg-hover text-surface'
    : 'bg-transparent text-muted hover:bg-hover hover:text-surface'
}
</script>

<template>
  <section data-test-id="pages-panel" class="flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-center justify-between px-3 py-1.5">
      <span data-test-id="pages-header" class="text-[11px] font-semibold text-surface">{{
        messages.pages
      }}</span>
      <IconButton :label="messages.addPage" data-test-id="pages-add" @click="actions.addPage()">
        <icon-lucide-plus class="size-3.5" />
      </IconButton>
    </div>
    <VirtualRows class="min-h-0 flex-1" kind="pages" :total="total" :page-id="pageId">
      <template #default="{ rows }">
        <div v-if="rows.length === 0" class="px-2 py-1 text-[11px] text-muted">
          {{ messages.noPages }}
        </div>
        <div v-else role="listbox" :aria-label="messages.pages" class="pb-1">
          <ContextMenuRoot v-for="row in rows" :key="row.id" :modal="false">
            <ContextMenuTrigger as-child>
              <button
                type="button"
                role="option"
                :aria-selected="row.id === pageId"
                class="flex h-6 w-full cursor-pointer items-center gap-1.5 rounded border-none px-2 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-panel-focus"
                :class="itemClass(row.id === pageId)"
                @click="actions.select(row.id)"
              >
                <icon-lucide-file class="size-3 shrink-0 opacity-70" />
                <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
              </button>
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

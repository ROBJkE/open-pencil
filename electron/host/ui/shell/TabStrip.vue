<script setup lang="ts">
import Tip from '../overlay/Tip.vue'
import { messages } from './messages'
import type { DocumentTab } from './tabs'

const { tabs, activeId } = defineProps<{ tabs: DocumentTab[]; activeId: string }>()

const emit = defineEmits<{
  select: [id: string]
  close: [id: string]
  create: []
}>()

function itemClass(active: boolean): string {
  return active ? 'bg-panel text-surface' : 'text-muted hover:text-surface'
}
</script>

<template>
  <div data-test-id="tab-strip" data-slot="tab-bar" class="flex h-9 shrink-0 items-end border-b border-border bg-canvas">
    <div class="scrollbar-none flex h-full min-w-0 flex-1 items-end overflow-x-auto">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="group/tab flex h-full max-w-48 min-w-24 items-center border-r border-border pr-1"
        :class="itemClass(tab.id === activeId)"
      >
        <button
          type="button"
          class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-3 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-panel-focus"
          :aria-pressed="tab.id === activeId"
          @click="emit('select', tab.id)"
        >
          <icon-lucide-file class="size-3 shrink-0 opacity-50" />
          <span class="min-w-0 flex-1 truncate">{{ tab.name }}</span>
        </button>
        <Tip :label="messages.closeTab" side="bottom">
          <button
            type="button"
            class="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-hover focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-panel-focus"
            :class="tab.id === activeId ? 'opacity-100' : ''"
            :aria-label="messages.closeTab"
            @click="emit('close', tab.id)"
          >
            <icon-lucide-x class="size-3" />
          </button>
        </Tip>
      </div>
    </div>
    <Tip :label="messages.newTab" side="bottom">
      <button
        type="button"
        class="mx-1 flex size-6 shrink-0 cursor-pointer items-center justify-center self-center rounded text-muted hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
        :aria-label="messages.newTab"
        @click="emit('create')"
      >
        <icon-lucide-plus class="size-4" />
      </button>
    </Tip>
  </div>
</template>

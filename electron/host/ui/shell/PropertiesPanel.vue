<script setup lang="ts">
import { computed, ref } from 'vue'

import { messages } from './messages'
import { useDocumentProjection } from './context'
import DesignProperties from './DesignProperties.vue'

const tab = ref<'design' | 'code' | 'ai' | 'lint'>('design')
const view = useDocumentProjection()
const zoomLabel = computed(() => `${Math.round(view.viewport.value.zoom * 100)}%`)

const tabs = [
  { id: 'design' as const, label: messages.design },
  { id: 'code' as const, label: messages.code },
  { id: 'ai' as const, label: messages.ai },
  { id: 'lint' as const, label: messages.lint }
]
</script>

<template>
  <aside
    data-test-id="properties-panel"
    class="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-border bg-panel"
  >
    <div class="flex h-10 shrink-0 items-center gap-0.5 overflow-x-clip border-b border-border px-2">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        class="relative flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted outline-none hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus data-[state=active]:font-semibold data-[state=active]:text-surface"
        :data-state="tab === item.id ? 'active' : 'inactive'"
        @click="tab = item.id"
      >
        <icon-lucide-code v-if="item.id === 'code'" class="size-3 shrink-0" />
        <icon-lucide-sparkles v-else-if="item.id === 'ai'" class="size-3 shrink-0" />
        <icon-lucide-list-checks v-else-if="item.id === 'lint'" class="size-3 shrink-0" />
        {{ item.label }}
        <span
          v-if="tab === item.id"
          class="absolute inset-x-1.5 -bottom-[9px] h-0.5 rounded-full bg-accent"
        />
      </button>
      <span v-if="tab === 'design'" class="ml-auto px-1 text-[11px] text-muted">{{ zoomLabel }}</span>
    </div>

    <DesignProperties v-if="tab === 'design'" />
    <div v-else-if="tab === 'code'" class="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted">
      {{ messages.codeShell }}
    </div>
    <div v-else-if="tab === 'ai'" class="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted">
      {{ messages.aiShell }}
    </div>
    <div v-else class="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted">
      {{ messages.lintShell }}
    </div>
  </aside>
</template>

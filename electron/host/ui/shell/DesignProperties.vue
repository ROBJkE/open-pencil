<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import { useSession } from '@open-pencil/vue-next'

import AppInput from '../input/AppInput.vue'
import { readNumber, readText } from '../session/fields'
import { messages } from './messages'
import { useDocumentId, useDocumentProjection } from './context'
import NumberScrub from './NumberScrub.vue'
import PropertySection from './PropertySection.vue'

interface ScrubField {
  field: string
  icon: string
  label: string
  suffix?: string
  min?: number
  max?: number
}

const positionFields: ScrubField[] = [
  { field: 'x', icon: 'X', label: 'X' },
  { field: 'y', icon: 'Y', label: 'Y' },
  { field: 'rotation', icon: 'R', label: 'Rotation', suffix: '°', min: -360, max: 360 }
]

const layoutFields: ScrubField[] = [
  { field: 'width', icon: 'W', label: 'Width', min: 0 },
  { field: 'height', icon: 'H', label: 'Height', min: 0 },
  { field: 'gap', icon: 'G', label: 'Gap', min: 0 },
  { field: 'padding', icon: 'P', label: 'Padding', min: 0 }
]

const appearanceFields: ScrubField[] = [
  { field: 'opacity', icon: '%', label: 'Opacity', suffix: '%', min: 0, max: 100 }
]

const strokeFields: ScrubField[] = [
  { field: 'strokeWidth', icon: 'S', label: 'Stroke width', min: 0 }
]

const typeFields: ScrubField[] = [{ field: 'fontSize', icon: 'T', label: 'Font size', min: 1 }]

const view = useDocumentProjection()
const documentId = useDocumentId()
const session = useSession()
const drafts = shallowRef<Record<string, number>>({})
const family = ref('')

const ids = computed(() => [...view.selection.value.ids])
const fields = computed(() => view.selection.value.fields)
const title = computed(() => {
  if (ids.value.length === 0) return messages.noSelection
  if (ids.value.length > 1) return `${ids.value.length} selected`
  return readText(fields.value.name) || ids.value[0] || messages.noSelection
})
const typeLabel = computed(() => readText(fields.value.type))
const fillLabel = computed(() => readText(fields.value.fill) || messages.fill)
const strokeLabel = computed(() => readText(fields.value.stroke) || messages.stroke)

watch(
  () => view.selection.value.ids.join('\0'),
  () => {
    drafts.value = {}
  }
)

watch(
  () => readText(view.selection.value.fields.fontFamily),
  (next) => {
    family.value = next
  },
  { immediate: true }
)

function valueFor(field: string): number | null {
  const draft = drafts.value[field]
  if (draft !== undefined) return draft
  return readNumber(fields.value[field])
}

function mixed(field: string): boolean {
  return drafts.value[field] === undefined && view.selection.value.mixed.includes(field)
}

function onCommit(field: string, value: number): void {
  drafts.value = { ...drafts.value, [field]: value }
}

async function commitFamily(): Promise<void> {
  const id = ids.value[0]
  if (!id) return
  await session.submit(documentId.value, {
    type: 'edit',
    id,
    fields: { fontFamily: family.value }
  })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div v-if="ids.length === 0" class="px-3 py-6 text-center text-[11px] text-muted">
      {{ messages.noSelection }}
    </div>
    <div v-else class="scrollbar-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4">
    <header class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 border-b border-border px-3 py-2">
      <icon-lucide-square class="size-3.5 text-muted" />
      <span class="min-w-0 truncate text-xs font-semibold text-surface">{{ title }}</span>
    </header>

    <PropertySection :label="messages.position">
      <div class="grid grid-cols-2 gap-1.5">
        <NumberScrub
          v-for="item in positionFields"
          :key="item.field"
          :document-id="documentId"
          :node-ids="ids"
          :field="item.field"
          :value="valueFor(item.field)"
          :mixed="mixed(item.field)"
          :label="item.label"
          :icon="item.icon"
          :suffix="item.suffix"
          :min="item.min"
          :max="item.max"
          @commit="onCommit(item.field, $event)"
        />
      </div>
    </PropertySection>

    <PropertySection :label="messages.layout">
      <div class="grid grid-cols-2 gap-1.5">
        <NumberScrub
          v-for="item in layoutFields"
          :key="item.field"
          :document-id="documentId"
          :node-ids="ids"
          :field="item.field"
          :value="valueFor(item.field)"
          :mixed="mixed(item.field)"
          :label="item.label"
          :icon="item.icon"
          :suffix="item.suffix"
          :min="item.min"
          :max="item.max"
          @commit="onCommit(item.field, $event)"
        />
      </div>
    </PropertySection>

    <PropertySection :label="messages.appearance">
      <div class="grid grid-cols-2 gap-1.5">
        <NumberScrub
          v-for="item in appearanceFields"
          :key="item.field"
          :document-id="documentId"
          :node-ids="ids"
          :field="item.field"
          :value="valueFor(item.field)"
          :mixed="mixed(item.field)"
          :label="item.label"
          :icon="item.icon"
          :suffix="item.suffix"
          :min="item.min"
          :max="item.max"
          @commit="onCommit(item.field, $event)"
        />
        <div v-if="typeLabel" class="flex h-6 items-center px-1 text-[11px] text-muted">{{ typeLabel }}</div>
      </div>
    </PropertySection>

    <PropertySection :label="messages.fill">
      <div class="flex h-6 items-center gap-2 rounded bg-panel-field px-1.5">
        <span class="size-3.5 rounded-sm bg-accent" />
        <span class="truncate text-[11px] text-surface">{{ fillLabel }}</span>
      </div>
    </PropertySection>

    <PropertySection :label="messages.stroke">
      <div class="mb-1.5 flex h-6 items-center gap-2 rounded bg-panel-field px-1.5">
        <span class="size-3.5 rounded-sm border border-muted" />
        <span class="truncate text-[11px] text-surface">{{ strokeLabel }}</span>
      </div>
      <NumberScrub
        v-for="item in strokeFields"
        :key="item.field"
        :document-id="documentId"
        :node-ids="ids"
        :field="item.field"
        :value="valueFor(item.field)"
        :mixed="mixed(item.field)"
        :label="item.label"
        :icon="item.icon"
        :min="item.min"
        :max="item.max"
        @commit="onCommit(item.field, $event)"
      />
    </PropertySection>

    <PropertySection :label="messages.typography">
      <div class="mb-1.5">
        <AppInput
          v-model="family"
          tone="panel"
          size="xs"
          :aria-label="messages.fontFamily"
          @change="commitFamily"
        />
      </div>
      <NumberScrub
        v-for="item in typeFields"
        :key="item.field"
        :document-id="documentId"
        :node-ids="ids"
        :field="item.field"
        :value="valueFor(item.field)"
        :mixed="mixed(item.field)"
        :label="item.label"
        :icon="item.icon"
        :min="item.min"
        :max="item.max"
        @commit="onCommit(item.field, $event)"
      />
    </PropertySection>
    </div>
  </div>
</template>

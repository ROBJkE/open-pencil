<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { tv } from 'tailwind-variants'
import { ref, watch } from 'vue'

import type { Command } from '@open-pencil/session'
import { useSession } from '@open-pencil/vue-next'

import {
  cancelPreviewCommand,
  commitPreviewCommand,
  editCommand,
  previewCommand,
  scrubValue
} from '../session/scrub'
import numberFieldTheme from '../theme/number-field'
import { messages } from './messages'

const {
  documentId,
  nodeIds,
  field,
  value,
  mixed,
  label,
  icon,
  suffix,
  min,
  max
} = defineProps<{
  documentId: string
  nodeIds: string[]
  field: string
  value: number | null
  mixed: boolean
  label: string
  icon?: string
  suffix?: string
  min?: number
  max?: number
}>()

const emit = defineEmits<{ commit: [value: number] }>()

const session = useSession()
const styles = tv(numberFieldTheme)()
const text = ref('')
const scrubbing = ref(false)
const editing = ref(false)
let originX = 0
let origin = 0
let samples: number[] = []
let chain = Promise.resolve()
let settled = true

watch(
  () => value,
  (next) => {
    if (scrubbing.value || editing.value) return
    text.value = next === null ? '' : String(next)
  },
  { immediate: true }
)

function send(command: Command): void {
  chain = chain
    .then(() => session.submit(documentId, command))
    .then(() => undefined)
    .catch((error: unknown) => {
      console.warn('[shell] command failed', error)
    })
}

function onPointerDown(event: PointerEvent): void {
  if (editing.value || mixed || value === null || nodeIds.length === 0 || event.button !== 0) return
  if (event.target instanceof HTMLInputElement) return
  const root = event.currentTarget
  if (!(root instanceof HTMLElement)) return
  root.setPointerCapture(event.pointerId)
  originX = event.clientX
  origin = value
  samples = []
  settled = false
  scrubbing.value = true
}

function onPointerMove(event: PointerEvent): void {
  if (!scrubbing.value || settled) return
  const next = scrubValue(origin, event.clientX - originX, min, max)
  const previous = samples.at(-1)
  if (previous === next) return
  samples = [...samples, next]
  text.value = String(next)
  send(previewCommand(nodeIds, field, next))
}

function finish(commit: boolean): void {
  if (settled) return
  settled = true
  scrubbing.value = false
  const last = samples.at(-1)
  if (commit && last !== undefined) {
    send(commitPreviewCommand())
    emit('commit', last)
    return
  }
  if (samples.length > 0) send(cancelPreviewCommand())
  text.value = value === null ? '' : String(value)
}

function onInput(event: Event): void {
  if (event.target instanceof HTMLInputElement) text.value = event.target.value
}

function commitTyped(): void {
  if (nodeIds.length === 0 || mixed) return
  const parsed = Number(text.value)
  if (!Number.isFinite(parsed)) {
    text.value = value === null ? '' : String(value)
    return
  }
  const next = scrubValue(parsed, 0, min, max)
  text.value = String(next)
  if (next === value) return
  for (const id of nodeIds) send(editCommand(id, field, next))
  emit('commit', next)
}

function onFocus(): void {
  editing.value = true
}

function onBlur(): void {
  editing.value = false
  commitTyped()
}

function onEnter(event: KeyboardEvent): void {
  if (!(event.target instanceof HTMLInputElement)) return
  event.target.blur()
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!scrubbing.value || event.code !== 'Escape') return
  event.preventDefault()
  finish(false)
})
</script>

<template>
  <div
    :class="styles.root()"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="finish(true)"
    @pointercancel="finish(false)"
  >
    <span :class="styles.leading()">
      <span v-if="icon" class="text-[11px] leading-none">{{ icon }}</span>
    </span>
    <input
      :class="styles.field()"
      :value="text"
      :aria-label="label"
      :placeholder="mixed ? messages.mixed : ''"
      inputmode="decimal"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown.enter="onEnter"
    />
    <span v-if="suffix" :class="styles.suffix()">{{ suffix }}</span>
  </div>
</template>

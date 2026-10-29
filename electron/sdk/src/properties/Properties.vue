<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import type { JSONValue, SelectionProperties } from '@open-pencil/session'

import { useSession } from '../session'
import {
  editedValue,
  eventChecked,
  eventInputValue,
  propertyFields,
  type PropertyField
} from './fields'
import { beginScrub, previewEdits, scrubbedNumber, type NumberScrub } from './scrub'

const { documentId } = defineProps<{
  documentId: string
}>()

const session = useSession()
const selection = ref<SelectionProperties>({ ids: [], fields: {}, mixed: [] })
const fields = computed(() => propertyFields(selection.value))
const scrub = ref<NumberScrub | null>(null)
let stopListening: () => void = function unsubscribe() {
  return undefined
}
let skipChangeKey: string | null = null

async function refresh(): Promise<void> {
  selection.value = await session.selection(documentId)
}

function listen(): void {
  stopListening()
  stopListening = session.subscribe(documentId, function onSession() {
    if (scrub.value) return
    void refresh()
  })
}

function documentSource(): string {
  return documentId
}

onMounted(function mountProperties() {
  listen()
  void refresh()
})

onUnmounted(function unmountProperties() {
  stopListening()
})

watch(documentSource, function onDocumentChange() {
  listen()
  void refresh()
})

async function editAll(key: string, value: JSONValue): Promise<void> {
  for (const id of selection.value.ids) {
    await session.submit(documentId, { type: 'edit', id, fields: { [key]: value } })
  }
  await refresh()
}

function onChange(field: PropertyField, event: Event): void {
  if (skipChangeKey === field.key) {
    skipChangeKey = null
    return
  }
  const text = eventInputValue(event)
  if (text === null) return
  const value = editedValue(field, text)
  if (value === null) return
  void editAll(field.key, value)
}

function onToggle(field: PropertyField, event: Event): void {
  const checked = eventChecked(event)
  if (checked === null) return
  void editAll(field.key, checked)
}

function onPointerDown(field: PropertyField, event: PointerEvent): void {
  const next = beginScrub(field, event.clientX)
  if (!next || selection.value.ids.length === 0) return
  scrub.value = next
  const target = event.currentTarget
  if (target instanceof HTMLElement) target.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  const current = scrub.value
  if (!current || selection.value.ids.length === 0) return
  current.previewed = true
  const value = scrubbedNumber(current, event.clientX)
  void session.submit(documentId, {
    type: 'preview',
    edits: previewEdits(selection.value.ids, current.key, value)
  })
}

function onPointerUp(): void {
  const current = scrub.value
  scrub.value = null
  if (!current || !current.previewed) return
  skipChangeKey = current.key
  queueMicrotask(function clearScrubChange() {
    if (skipChangeKey === current.key) skipChangeKey = null
  })
  void session.submit(documentId, { type: 'commit-preview' }).then(function committed() {
    return refresh()
  })
}
</script>

<template>
  <section data-slot="properties">
    <label v-for="field in fields" :key="field.key" :data-field="field.key">
      <span>{{ field.key }}</span>
      <input
        v-if="field.kind === 'boolean'"
        type="checkbox"
        :checked="field.checked"
        :data-kind="field.kind"
        @change="onToggle(field, $event)"
      />
      <input
        v-else-if="field.kind !== 'complex'"
        :value="field.text"
        :data-kind="field.kind"
        @change="onChange(field, $event)"
        @pointerdown="onPointerDown(field, $event)"
        @pointermove="onPointerMove($event)"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
      <span v-else :data-kind="field.kind">{{ field.text }}</span>
    </label>
  </section>
</template>

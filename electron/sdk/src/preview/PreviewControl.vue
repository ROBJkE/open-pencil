<script setup lang="ts">
import { ref, type CSSProperties } from 'vue'

import { PREVIEW_CONTROL_POINTER_EVENTS, type PreviewKind } from './model'

const { kind, controlId } = defineProps<{
  kind: PreviewKind
  controlId: string
}>()

const pressed = ref<boolean>(false)

const fillStyle: CSSProperties = {
  boxSizing: 'border-box',
  display: 'block',
  width: '100%',
  height: '100%',
  margin: '0',
  pointerEvents: PREVIEW_CONTROL_POINTER_EVENTS
}

function onPress(): void {
  pressed.value = !pressed.value
}

function pressedState(): 'true' | 'false' {
  return pressed.value ? 'true' : 'false'
}
</script>

<template>
  <button
    v-if="kind === 'button'"
    type="button"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :style="fillStyle"
  />
  <input
    v-else-if="kind === 'textField'"
    type="text"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :style="fillStyle"
  />
  <textarea
    v-else-if="kind === 'textarea'"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :style="fillStyle"
  />
  <input
    v-else-if="kind === 'numberField'"
    type="number"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :style="fillStyle"
  />
  <button
    v-else-if="kind === 'toggle'"
    type="button"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :aria-pressed="pressedState()"
    :style="fillStyle"
    @click="onPress"
  />
  <input
    v-else-if="kind === 'switch'"
    type="checkbox"
    role="switch"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :style="fillStyle"
  />
  <input
    v-else-if="kind === 'checkbox'"
    type="checkbox"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :style="fillStyle"
  />
  <input
    v-else-if="kind === 'radio'"
    type="radio"
    data-slot="preview-control"
    :data-kind="kind"
    :name="controlId"
    :aria-label="kind"
    :style="fillStyle"
  />
  <div v-else-if="kind === 'radioGroup'" role="radiogroup" :style="fillStyle">
    <input
      type="radio"
      data-slot="preview-control"
      :data-kind="kind"
      :name="controlId"
      :aria-label="kind"
      :style="fillStyle"
    />
  </div>
  <div v-else-if="kind === 'toggleGroup'" role="group" :style="fillStyle">
    <button
      type="button"
      data-slot="preview-control"
      :data-kind="kind"
      :aria-label="kind"
      :aria-pressed="pressedState()"
      :style="fillStyle"
      @click="onPress"
    />
  </div>
  <input
    v-else-if="kind === 'slider'"
    type="range"
    min="0"
    max="100"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :style="fillStyle"
  />
  <progress
    v-else-if="kind === 'progress'"
    max="100"
    value="0"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :style="fillStyle"
  />
  <div v-else-if="kind === 'tabs'" role="tablist" :style="fillStyle">
    <button
      type="button"
      role="tab"
      data-slot="preview-control"
      :data-kind="kind"
      aria-selected="true"
      :aria-label="kind"
      :style="fillStyle"
    />
  </div>
  <button
    v-else-if="kind === 'collapsible'"
    type="button"
    data-slot="preview-control"
    :data-kind="kind"
    :aria-label="kind"
    :aria-expanded="pressedState()"
    :style="fillStyle"
    @click="onPress"
  />
  <div v-else-if="kind === 'accordion'" :style="fillStyle">
    <button
      type="button"
      data-slot="preview-control"
      :data-kind="kind"
      :aria-label="kind"
      :aria-expanded="pressedState()"
      :style="fillStyle"
      @click="onPress"
    />
  </div>
</template>

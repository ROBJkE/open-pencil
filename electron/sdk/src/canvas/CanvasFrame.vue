<script setup lang="ts">
import { computed } from 'vue'

import { selectionChrome, type ScreenPointer } from './chrome'

const { pointerEvents } = defineProps<{
  pointerEvents: readonly ScreenPointer[]
}>()

const chrome = computed(() => selectionChrome(pointerEvents))
</script>

<template>
  <div data-slot="canvas-frame" :style="{ position: 'relative' }">
    <slot name="tiles" />
    <div
      v-if="chrome"
      data-slot="selection-chrome"
      :style="{
        position: 'absolute',
        left: `${chrome.x}px`,
        top: `${chrome.y}px`,
        width: `${chrome.width}px`,
        height: `${chrome.height}px`,
        pointerEvents: 'none',
        outline: '1px solid'
      }"
    />
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'

import {
  PREVIEW_CAPTURE_WHEEL,
  PREVIEW_CONTROL_POINTER_EVENTS,
  PREVIEW_LAYER_POINTER_EVENTS,
  type PreviewIsland
} from './model'
import PreviewControl from './PreviewControl.vue'

const { islands } = defineProps<{
  islands: readonly PreviewIsland[]
}>()

const layerStyle: CSSProperties = {
  position: 'absolute',
  top: '0',
  left: '0',
  right: '0',
  bottom: '0',
  overflow: 'hidden',
  pointerEvents: PREVIEW_LAYER_POINTER_EVENTS
}

function captureWheelAttribute(): string {
  return String(PREVIEW_CAPTURE_WHEEL)
}

function islandStyle(island: PreviewIsland): CSSProperties {
  return {
    position: 'absolute',
    left: `${island.rect.x}px`,
    top: `${island.rect.y}px`,
    width: `${island.rect.width}px`,
    height: `${island.rect.height}px`,
    margin: '0',
    boxSizing: 'border-box',
    pointerEvents: PREVIEW_CONTROL_POINTER_EVENTS
  }
}
</script>

<template>
  <div data-slot="preview-layer" :data-capture-wheel="captureWheelAttribute()" :style="layerStyle">
    <div
      v-for="island in islands"
      :key="island.id"
      data-slot="preview-island"
      :data-island="island.id"
      :style="islandStyle(island)"
    >
      <PreviewControl :kind="island.kind" :control-id="island.id" />
    </div>
  </div>
</template>

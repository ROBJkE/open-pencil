<script setup lang="ts">
import type { CanvasTool } from '@open-pencil/session'

const { tool } = defineProps<{ tool: CanvasTool }>()
</script>

<template>
  <icon-lucide-mouse-pointer-2 v-if="tool === 'select'" class="size-4" />
  <icon-lucide-frame v-else-if="tool === 'frame'" class="size-4" />
  <icon-lucide-section v-else-if="tool === 'section'" class="size-4" />
  <icon-lucide-square v-else-if="tool === 'rectangle'" class="size-4" />
  <icon-lucide-circle v-else-if="tool === 'ellipse'" class="size-4" />
  <icon-lucide-minus v-else-if="tool === 'line'" class="size-4" />
  <icon-lucide-triangle v-else-if="tool === 'polygon'" class="size-4" />
  <icon-lucide-star v-else-if="tool === 'star'" class="size-4" />
  <icon-lucide-type v-else-if="tool === 'text'" class="size-4" />
  <icon-lucide-pen-tool v-else-if="tool === 'pen'" class="size-4" />
  <icon-lucide-spline v-else-if="tool === 'vector'" class="size-4" />
  <icon-lucide-hand v-else-if="tool === 'hand'" class="size-4" />
  <icon-lucide-zoom-in v-else class="size-4" />
</template>

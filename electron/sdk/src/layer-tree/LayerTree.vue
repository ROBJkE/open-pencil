<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'

import type { LayerRow } from '@open-pencil/session'

import { useSession } from '../session'
import { LAYER_ROW_HEIGHT, rowPlacement } from './model'
import { useLayerWindow } from './use-layer-window'

const {
  documentId,
  parentId,
  rootsOnly = false
} = defineProps<{
  documentId: string
  parentId?: string
  rootsOnly?: boolean
}>()

const session = useSession()
const { rows, total, offset, onScroll, reload } = useLayerWindow({
  documentId: () => documentId,
  parentId: () => parentId ?? null,
  rootsOnly: () => rootsOnly
})

const spacerStyle = computed((): CSSProperties => ({
  position: 'relative',
  height: `${total.value * LAYER_ROW_HEIGHT}px`
}))

function placement(index: number, depth: number) {
  return rowPlacement(offset.value, index, depth)
}

function onSelect(id: string): void {
  void session.submit(documentId, { type: 'set-selection', ids: [id] }).then(function refresh() {
    return reload()
  })
}

function onToggle(row: LayerRow): void {
  void session
    .submit(documentId, { type: 'set-expanded', id: row.id, expanded: !row.expanded })
    .then(function refresh() {
      return reload()
    })
}
</script>

<template>
  <div data-slot="layer-tree" :style="{ overflow: 'auto' }" @scroll="onScroll">
    <div :style="spacerStyle">
      <div v-for="(row, index) in rows" :key="row.id" :style="placement(index, row.depth)">
        <button
          v-if="row.childCount > 0"
          type="button"
          :aria-expanded="row.expanded"
          :aria-label="row.expanded ? 'Collapse' : 'Expand'"
          @click.stop="onToggle(row)"
        />
        <button
          type="button"
          :data-layer-id="row.id"
          :data-selected="row.selected"
          @click="onSelect(row.id)"
        >
          {{ row.name }}
        </button>
      </div>
    </div>
  </div>
</template>

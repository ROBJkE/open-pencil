<script setup lang="ts">
import LayerTree from '../layer-tree/LayerTree.vue'

const { documentId } = defineProps<{
  documentId: string
}>()
</script>

<template>
  <div data-slot="page-list">
    <LayerTree :document-id="documentId" roots-only />
  </div>
</template>

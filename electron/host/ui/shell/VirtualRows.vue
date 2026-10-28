<script setup lang="ts">
import { useElementSize, useScroll } from '@vueuse/core'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'

import type { LayerRow } from '@open-pencil/session'
import { useSession } from '@open-pencil/vue-next'

import { LAYER_ROW_HEIGHT, treeQuery } from '../session/window'
import { useDocumentId, useRevision } from './context'

const { kind, total, pageId } = defineProps<{
  kind: 'pages' | 'layers'
  total: number
  pageId: string | null
}>()

const session = useSession()
const documentId = useDocumentId()
const revision = useRevision()
const viewport = useTemplateRef<HTMLElement>('viewport')
const { height } = useElementSize(viewport)
const { y } = useScroll(viewport)
const rows = shallowRef<LayerRow[]>([])
const placedOffset = shallowRef(0)

const query = computed(() => treeQuery(kind, y.value, height.value, total, pageId))
const spacerHeight = computed(() => `${Math.max(0, total) * LAYER_ROW_HEIGHT}px`)
const rowOffset = computed(() => `translateY(${placedOffset.value * LAYER_ROW_HEIGHT}px)`)

interface TreeRequest {
  id: string
  kind: 'pages' | 'layers'
  total: number
  pageId: string | null
  parentId: string | null
  offset: number
  limit: number
}

function currentRequest(): TreeRequest {
  const next = query.value
  return {
    id: documentId.value,
    kind,
    total,
    pageId,
    parentId: next.parentId,
    offset: next.offset,
    limit: next.limit
  }
}

function sameRequest(left: TreeRequest, right: TreeRequest): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.total === right.total &&
    left.pageId === right.pageId &&
    left.parentId === right.parentId &&
    left.offset === right.offset &&
    left.limit === right.limit
  )
}

let running = false
let queued = false

async function load(): Promise<void> {
  if (running) {
    queued = true
    return
  }
  running = true
  try {
    do {
      queued = false
      const request = currentRequest()
      if (request.total <= 0) {
        rows.value = []
        placedOffset.value = 0
        continue
      }
      const window = await session.layerTree(request.id, {
        parentId: request.parentId,
        offset: request.offset,
        limit: request.limit
      })
      if (!sameRequest(request, currentRequest())) {
        queued = true
        continue
      }
      rows.value = window.rows
      placedOffset.value = request.offset
    } while (queued)
  } finally {
    running = false
  }
}

watch(
  () =>
    [
      documentId.value,
      revision.value,
      kind,
      total,
      pageId,
      query.value.offset,
      query.value.limit
    ] as const,
  () => {
    void load()
  },
  { immediate: true }
)

watch(documentId, () => {
  const element = viewport.value
  if (element) element.scrollTop = 0
})
</script>

<template>
  <div ref="viewport" class="scrollbar-thin h-full overflow-x-hidden overflow-y-auto px-1">
    <div class="relative w-full" :style="{ height: spacerHeight }">
      <div class="absolute inset-x-0 top-0" :style="{ transform: rowOffset }">
        <slot :rows="rows" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger
} from 'reka-ui'
import { shallowRef } from 'vue'

import { isLayerContainer, type LayerDropPosition, type LayerRow } from '@open-pencil/session'

import { useMenuUI } from '../menu/menu'
import { useShellActions } from './context'
import { layerDragStarted, layerDropPosition } from './layer-drag'
import { messages } from './messages'
import VirtualRows from './VirtualRows.vue'

const { total, pageId } = defineProps<{
  total: number
  pageId: string | null
}>()

const actions = useShellActions()
const menu = useMenuUI({ content: 'min-w-36', item: 'justify-start gap-2' })
const hint = shallowRef<{ id: string; position: LayerDropPosition } | null>(null)

interface LayerPointer {
  id: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
}

let pointer: LayerPointer | null = null

function pad(row: LayerRow): string {
  return `${8 + row.depth * 12}px`
}

function rowClass(row: LayerRow): string {
  const tone = row.selected
    ? 'bg-panel-selected text-on-accent hover:bg-panel-selected'
    : 'bg-transparent text-surface hover:bg-hover'
  const visible = row.visible ? tone : `${tone} opacity-40`
  if (hint.value?.id === row.id && hint.value.position === 'into') {
    return `${visible} ring-1 ring-inset ring-accent`
  }
  return visible
}

function onPointerDown(event: PointerEvent, row: LayerRow): void {
  if (event.button !== 0) return
  pointer = {
    id: row.id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    active: false
  }
}

function dropHint(
  sourceId: string,
  clientX: number,
  clientY: number
): { id: string; position: LayerDropPosition } | null {
  const hit = document.elementFromPoint(clientX, clientY)
  if (!(hit instanceof Element)) return null
  const row = hit.closest('[data-layer-id]')
  if (!(row instanceof HTMLElement)) return null
  const id = row.dataset.layerId
  if (!id || id === sourceId) return null
  const rect = row.getBoundingClientRect()
  return {
    id,
    position: layerDropPosition(
      clientY - rect.top,
      rect.height,
      isLayerContainer(row.dataset.layerType ?? '')
    )
  }
}

function onPointerMove(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.pointerId) return
  if (!pointer.active) {
    if (!layerDragStarted(event.clientX - pointer.startX, event.clientY - pointer.startY)) return
    pointer = { ...pointer, active: true }
  }
  hint.value = dropHint(pointer.id, event.clientX, event.clientY)
}

function onPointerUp(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.pointerId) return
  const current = pointer
  const target = hint.value
  pointer = null
  hint.value = null
  if (!current.active || !target) return
  actions.placeLayer(current.id, target.id, target.position)
}

function onPointerCancel(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.pointerId) return
  pointer = null
  hint.value = null
}

useEventListener(window, 'pointermove', onPointerMove)
useEventListener(window, 'pointerup', onPointerUp)
useEventListener(window, 'pointercancel', onPointerCancel)
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <header
      data-test-id="layers-header"
      class="shrink-0 px-3 py-2 text-[11px] font-semibold text-surface"
    >
      {{ messages.layers }}
    </header>
    <VirtualRows class="min-h-0 flex-1" kind="layers" :total="total" :page-id="pageId">
      <template #default="{ rows }">
        <div v-if="rows.length === 0" class="px-3 py-2 text-[11px] text-muted">
          {{ messages.noLayers }}
        </div>
        <div v-else role="tree" :aria-label="messages.layers">
          <ContextMenuRoot v-for="row in rows" :key="row.id" :modal="false">
            <ContextMenuTrigger as-child>
              <div
                role="treeitem"
                :data-layer-id="row.id"
                :data-layer-type="row.type"
                :aria-selected="row.selected"
                class="relative flex w-full cursor-pointer select-none items-center gap-1 rounded border-none pr-1 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-panel-focus"
                :class="rowClass(row)"
                :style="{ height: '24px', paddingLeft: pad(row) }"
                @pointerdown="onPointerDown($event, row)"
                @click="actions.select(row.id)"
              >
                <span
                  v-if="hint?.id === row.id && hint.position !== 'into'"
                  class="pointer-events-none absolute inset-x-1 z-10 h-px bg-accent"
                  :class="hint.position === 'before' ? 'top-0' : 'bottom-0'"
                />
                <button
                  v-if="row.childCount > 0"
                  type="button"
                  class="flex w-4 shrink-0 items-center justify-center text-current"
                  :aria-label="row.expanded ? messages.collapseLayer : messages.expandLayer"
                  @pointerdown.stop
                  @click.stop="actions.expand(row.id, !row.expanded)"
                >
                  <icon-lucide-chevron-right
                    class="size-3"
                    :class="row.expanded ? 'rotate-90' : 'rotate-0'"
                  />
                </button>
                <span v-else class="w-4 shrink-0" />
                <icon-lucide-frame v-if="row.type === 'frame'" class="size-3 shrink-0 opacity-70" />
                <icon-lucide-square v-else class="size-3 shrink-0 opacity-70" />
                <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuPortal>
              <ContextMenuContent :class="menu.content">
                <ContextMenuItem :class="menu.item" @select="actions.select(row.id)">
                  {{ messages.select }}
                </ContextMenuItem>
                <ContextMenuItem :class="menu.item" @select="actions.removeNode(row.id)">
                  {{ messages.delete }}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenuPortal>
          </ContextMenuRoot>
        </div>
      </template>
    </VirtualRows>
  </section>
</template>

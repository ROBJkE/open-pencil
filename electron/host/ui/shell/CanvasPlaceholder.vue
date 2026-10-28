<script setup lang="ts">
import { computed } from 'vue'

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger
} from 'reka-ui'

import { useMenuUI } from '../menu/menu'
import { readText } from '../session/fields'
import { messages } from './messages'
import { useDocumentProjection, useShellActions } from './context'
import Toolbar from './Toolbar.vue'

const view = useDocumentProjection()
const actions = useShellActions()
const menu = useMenuUI({ content: 'min-w-40', item: 'justify-start gap-2' })
const title = computed(() => readText(view.selection.value.fields.name) || messages.canvas)

</script>

<template>
  <ContextMenuRoot :modal="false">
    <ContextMenuTrigger as-child>
      <div data-test-id="canvas-placeholder" class="relative min-w-0 flex-1 overflow-hidden bg-canvas">
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="flex h-40 w-60 flex-col items-center justify-center gap-1 rounded border border-dashed border-border bg-panel/40">
            <span class="text-xs font-medium text-surface">{{ title }}</span>
            <span class="text-[11px] text-muted">{{ messages.canvas }}</span>
          </div>
        </div>
        <Toolbar />
      </div>
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent :class="menu.content">
        <ContextMenuItem :class="menu.item" @select="actions.undo()">{{ messages.undo }}</ContextMenuItem>
        <ContextMenuItem :class="menu.item" @select="actions.redo()">{{ messages.redo }}</ContextMenuItem>
        <ContextMenuItem :class="menu.item" @select="actions.openSettings()">{{ messages.settings }}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { CANVAS_TOOLS } from '@open-pencil/session'

import Tip from '../overlay/Tip.vue'
import { toolTip } from './messages'
import { useActiveTool, useShellActions } from './context'
import ToolIcon from './ToolIcon.vue'

const tool = useActiveTool()
const actions = useShellActions()
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
    <div
      data-test-id="toolbar"
      class="pointer-events-auto flex gap-0.5 rounded-xl bg-panel p-1 shadow-[0_8px_30px_rgb(0_0_0/0.4)]"
    >
      <Tip v-for="item in CANVAS_TOOLS" :key="item" :label="toolTip(item)">
        <button
          type="button"
          class="flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
          :class="tool === item ? 'bg-accent text-on-accent hover:bg-accent hover:text-on-accent' : ''"
          :aria-pressed="tool === item"
          :aria-label="toolTip(item)"
          @click="actions.setTool(item)"
        >
          <ToolIcon :tool="item" />
        </button>
      </Tip>
    </div>
  </div>
</template>

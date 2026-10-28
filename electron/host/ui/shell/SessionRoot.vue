<script setup lang="ts">
import { markRaw, provide, toRaw } from 'vue'

import type { SessionClient } from '@open-pencil/session'
import { provideSession } from '@open-pencil/vue-next'

import type { OpenPencilBridge } from '../session/bridge'
import { WINDOW_KEY } from './context'
import EditorShell from './EditorShell.vue'

const { client, bridge } = defineProps<{
  client: SessionClient
  bridge: OpenPencilBridge
}>()

provideSession(markRaw(toRaw(client)))
provide(WINDOW_KEY, bridge)
</script>

<template>
  <EditorShell />
</template>

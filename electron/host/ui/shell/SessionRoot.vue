<script setup lang="ts">
import { markRaw, toRaw } from 'vue'

import type { SessionClient } from '@open-pencil/session'
import { provideSession } from '@open-pencil/vue-next'

import EditorShell from './EditorShell.vue'
import type { DocumentTab } from './tabs'

const { client, tabs } = defineProps<{
  client: SessionClient
  tabs: DocumentTab[]
}>()

provideSession(markRaw(toRaw(client)))
</script>

<template>
  <EditorShell :initial-tabs="tabs" />
</template>

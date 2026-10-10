<script setup lang="ts">
import { computed } from 'vue'

import { ACP_AGENTS, AI_PROVIDERS, type AIProviderID } from '@open-pencil/core/constants'

import AppSelect from '@/components/ui/select/AppSelect.vue'
import type { AppSelectGroup } from '@/components/ui/select/select'

interface ProviderSelectProps {
  allowAgents?: boolean
  ui?: {
    trigger?: string
    content?: string
    item?: string
    label?: string
    separator?: string
  }
}

const { ui } = defineProps<ProviderSelectProps>()

const acpAgents = computed(() => [] as typeof ACP_AGENTS)

const providerID = defineModel<AIProviderID>({ required: true })
const providerDef = computed(
  () => AI_PROVIDERS.find((provider) => provider.id === providerID.value) ?? AI_PROVIDERS[0]
)

const displayName = computed(() => {
  if (providerID.value === 'harness:pi') return 'Pi'
  if (providerID.value.startsWith('acp:')) {
    const agentId = providerID.value.replace('acp:', '')
    return ACP_AGENTS.find((agent) => agent.id === agentId)?.name ?? providerID.value
  }
  return providerDef.value.name
})

const groups = computed(() => {
  const result: AppSelectGroup<string>[] = []

  if (acpAgents.value.length) {
    result.push({
      label: 'Your agents',
      options: acpAgents.value.map((agent) => ({
        value: `acp:${agent.id}`,
        label: agent.name
      }))
    })
  }

  result.push({
    label: acpAgents.value.length ? 'Providers' : undefined,
    options: [...AI_PROVIDERS]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((provider) => ({
        value: provider.id,
        label: provider.name
      }))
  })

  return result
})
</script>

<template>
  <AppSelect v-model="providerID" :groups="groups" :placeholder="displayName" :ui="ui" />
</template>

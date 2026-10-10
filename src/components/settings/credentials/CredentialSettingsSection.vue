<script setup lang="ts">
import { useI18n } from '@open-pencil/vue'

import { useCredentialSettings } from '@/app/settings/credentials/preferences/use'
import SettingsGroup from '@/components/settings/layout/SettingsGroup.vue'
import SettingsSection from '@/components/settings/layout/SettingsSection.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import AppAlert from '@/components/ui/feedback/AppAlert.vue'
import AppSwitch from '@/components/ui/toggle/AppSwitch.vue'

const { credentials } = useI18n()
const { busy, paused, failed, checkFailed, remembered, retry, retryCheck } = useCredentialSettings()
</script>

<template>
  <SettingsSection>
    <template #title>{{ credentials.settingsTitle }}</template>
    <SettingsGroup>
      <label class="flex items-center justify-between gap-4 px-3 py-2.5">
        <span>
          <span class="block text-xs text-surface">{{ credentials.rememberDevice }}</span>
          <span v-if="!remembered" class="block text-[11px] text-muted">{{
            credentials.sessionOnly
          }}</span>
        </span>
        <AppSwitch v-model="remembered" :label="credentials.rememberDevice" />
      </label>
    </SettingsGroup>
    <AppAlert v-if="checkFailed" tone="warning" :heading="credentials.checkFailed">
      <template #actions>
        <AppButton size="xs" variant="outline" :disabled="busy" @click="retryCheck">{{
          credentials.retryCheck
        }}</AppButton>
      </template>
    </AppAlert>
    <AppAlert v-else-if="paused" tone="warning" :heading="credentials.accessPaused">
      <template #actions>
        <AppButton size="xs" variant="outline" :disabled="busy" @click="retry">{{
          credentials.retryAccess
        }}</AppButton>
      </template>
    </AppAlert>
    <AppAlert v-if="failed" tone="error" :heading="credentials.retryFailed" />
  </SettingsSection>
</template>

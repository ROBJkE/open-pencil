import { computed, ref } from 'vue'

import { browserCredentialsRemembered } from '../app'
import { setRememberCredentials } from '../media'
import { createCredentialAccessCheck } from './access-check'

export function useCredentialSettings() {
  const busy = ref(false)
  const { paused, checkFailed, check } = createCredentialAccessCheck(async () => false)
  const failed = ref(false)
  const remembered = computed({
    get: () => browserCredentialsRemembered.value,
    set: (value) => {
      void setRememberCredentials(value).catch(() => {
        failed.value = true
      })
    }
  })
  async function retryCheck() {
    if (busy.value) return
    busy.value = true
    try {
      await check()
    } finally {
      busy.value = false
    }
  }
  async function retry() {
    if (busy.value) return
    busy.value = true
    failed.value = false
    try {
      await check()
    } catch {
      failed.value = true
    } finally {
      busy.value = false
    }
  }
  return { busy, paused, failed, checkFailed, remembered, retry, retryCheck }
}

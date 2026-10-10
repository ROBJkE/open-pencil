import { ref } from 'vue'

import { BrowserCredentialStore } from '@/app/settings/credentials/browser'
import { MemoryCredentialStore } from '@/app/settings/credentials/memory'
import { createCredentialServices } from '@/app/settings/credentials/services'
import {
  browserRemembersCredentials,
  hasLegacyCredentialStorage,
  setBrowserRemembersCredentials
} from '@/app/settings/credentials/storage'
import { SwitchableCredentialStore } from '@/app/settings/credentials/switchable'
import type { CredentialRef, CredentialStore } from '@/app/settings/credentials/types'

const legacyCredentialsPresent = hasLegacyCredentialStorage()
if (legacyCredentialsPresent) setBrowserRemembersCredentials(true)

export const browserCredentialsRemembered = ref(
  browserRemembersCredentials() || legacyCredentialsPresent
)

function initialCredentialStore(): CredentialStore {
  if (browserCredentialsRemembered.value) return new BrowserCredentialStore()
  return new MemoryCredentialStore()
}

export const appCredentialStore = new SwitchableCredentialStore(initialCredentialStore())
export const appCredentialServices = createCredentialServices(appCredentialStore)

export async function setBrowserCredentialPersistence(
  remembered: boolean,
  references: CredentialRef[]
): Promise<void> {
  const next = remembered ? new BrowserCredentialStore() : new MemoryCredentialStore()
  await appCredentialStore.switchTo(next, references, { clearPrevious: !remembered })

  browserCredentialsRemembered.value = remembered
  setBrowserRemembersCredentials(remembered)
}

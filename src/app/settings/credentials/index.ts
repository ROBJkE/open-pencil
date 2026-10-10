import { BrowserCredentialStore } from '@/app/settings/credentials/browser'
import { MemoryCredentialStore } from '@/app/settings/credentials/memory'
import { createCredentialServices } from '@/app/settings/credentials/services'
import type { CredentialStore } from '@/app/settings/credentials/types'

export type BrowserCredentialPersistence = 'session' | 'remembered'

export function createCredentialStore(
  browserPersistence: BrowserCredentialPersistence = 'session'
): CredentialStore {
  return browserPersistence === 'remembered'
    ? new BrowserCredentialStore()
    : new MemoryCredentialStore()
}

export const sessionCredentialServices = createCredentialServices(createCredentialStore())

export { credentialRef } from '@/app/settings/credentials/reference'
export { createCredentialServices } from '@/app/settings/credentials/services'
export type {
  CredentialBackend,
  CredentialErrorCode,
  CredentialManager,
  CredentialRef,
  CredentialResolver,
  CredentialStatus,
  CredentialStore,
  CredentialStoreAvailability
} from '@/app/settings/credentials/types'
export { CredentialStoreError } from '@/app/settings/credentials/types'

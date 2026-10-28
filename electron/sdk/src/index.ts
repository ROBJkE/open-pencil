import { inject, provide, type InjectionKey } from 'vue'

import type { SessionClient } from '@open-pencil/session'

export const SESSION_KEY: InjectionKey<SessionClient> = Symbol('openpencil-session')

export function provideSession(client: SessionClient): void {
  provide(SESSION_KEY, client)
}

export function useSession(): SessionClient {
  const client = inject(SESSION_KEY)
  if (!client) throw new Error('provideSession is required before useSession')
  return client
}

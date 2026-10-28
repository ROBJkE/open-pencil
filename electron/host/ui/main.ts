import { createApp, markRaw } from 'vue'

import { createReplayClient } from '@open-pencil/session'

import { demoProjection } from './session/demo'
import { applyShellTheme } from './session/theme'
import SessionRoot from './shell/SessionRoot.vue'
import type { DocumentTab } from './shell/tabs'

import './shell.css'

const replay = createReplayClient([demoProjection()])
const client = markRaw(replay.client)
const tabs: DocumentTab[] = [
  { id: 'doc-untitled', name: 'Untitled' },
  { id: 'doc-components', name: 'Components' }
]

await client.openDocument(tabs[0] ?? { name: 'Untitled' })
await client.openDocument(tabs[1] ?? { name: 'Components' })
applyShellTheme('dark')

createApp(SessionRoot, { client, tabs: markRaw(tabs) }).mount('#app')

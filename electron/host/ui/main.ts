import { createApp, markRaw } from 'vue'

import { createBridgeSession } from './session/bridge'
import { applyShellTheme } from './session/theme'
import SessionRoot from './shell/SessionRoot.vue'

import './shell.css'

const bridge = window.openpencil
if (!bridge) throw new Error('OpenPencil preload is missing')

const reported = await bridge.documentCap()
const documentCap = typeof reported === 'number' && Number.isFinite(reported) ? reported : 2
const client = markRaw(createBridgeSession(bridge, documentCap))
applyShellTheme('dark')

createApp(SessionRoot, { client, bridge }).mount('#app')

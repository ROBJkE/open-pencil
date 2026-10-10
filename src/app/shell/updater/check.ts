import type { Ref } from 'vue'

import type { UpdaterMessages } from './messages'

interface UpdateCheckOptions {
  silent?: boolean
  messages: Ref<UpdaterMessages>
}

export async function checkForAppUpdate(_options: UpdateCheckOptions) {}

export function scheduleStartupUpdateCheck(_messages: Ref<UpdaterMessages>) {}

import { useEventListener } from '@vueuse/core'

import { isExitApproved } from '@/app/document/close/exit'
import { allTabs } from '@/app/tabs'

export function useDocumentCloseProtection() {
  useEventListener(window, 'beforeunload', (event) => {
    if (isExitApproved() || !allTabs.value.some((tab) => tab.isDirty)) return
    event.preventDefault()
    event.returnValue = ''
  })
}

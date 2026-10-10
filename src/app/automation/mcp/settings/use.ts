import { onMounted } from 'vue'

import { refreshMCPRuntime, restartMCPRuntime } from '@/app/automation/mcp/runtime'

export function useMCPSettings() {
  onMounted(() => {
    void refreshMCPRuntime()
  })

  function restart(): void {
    void restartMCPRuntime()
  }

  async function chooseRootDirectory(): Promise<void> {}

  return { restart, chooseRootDirectory }
}

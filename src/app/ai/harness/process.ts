import type { HarnessSidecarMessage } from '@open-pencil/harness'

export type HarnessChild = {
  write(data: number[]): Promise<void>
  kill(): Promise<void>
}

export type HarnessProcess = {
  child: HarnessChild
  messages: ReadableStream<HarnessSidecarMessage>
  send(request: object): Promise<void>
}

export async function spawnHarnessProcess(_options: {
  environment: Record<string, string>
  onUnexpectedClose: () => void
}): Promise<HarnessProcess> {
  throw new Error('The Pi harness companion is not available in the browser.')
}

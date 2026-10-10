export type AgentChild = {
  write(data: number[]): Promise<void>
  kill(): Promise<void>
}

type ACPProcessOptions = {
  command: string
  args: string[]
  logId: string
  destroying: () => boolean
  onUnexpectedClose: () => void
}

export async function spawnACPProcess(_options: ACPProcessOptions): Promise<{
  child: AgentChild
  input: WritableStream<Uint8Array>
  output: ReadableStream<Uint8Array>
}> {
  throw new Error('ACP agents are not available in the browser.')
}

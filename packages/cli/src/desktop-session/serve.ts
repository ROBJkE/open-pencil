import { createInterface } from 'node:readline'

import { DesktopSession } from '#cli/desktop-session/session'

const session = await DesktopSession.create()
const lines = createInterface({ input: process.stdin, terminal: false })

for await (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed) continue
  const response = await session.handleLine(trimmed)
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

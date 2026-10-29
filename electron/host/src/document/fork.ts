import { utilityProcess } from 'electron'

import { parseDocumentTile } from './protocol'
import type { DocumentPacket, DocumentRuntime } from './runtime'

function stderrText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk)
  return ''
}

/** One Electron utility process. Each document gets its own call, and its own heap. */
export function forkDocumentRuntime(modulePath: string): DocumentRuntime {
  const child = utilityProcess.fork(modulePath, [], {
    serviceName: 'openpencil-document',
    stdio: 'pipe'
  })
  const messages = new Set<(packet: DocumentPacket) => void>()
  const exits = new Set<(code: number | null) => void>()
  let exited = false

  child.on('message', (message: unknown) => {
    const packet: DocumentPacket | null =
      typeof message === 'string' ? { type: 'text', text: message } : parseDocumentTile(message)
    if (!packet) return
    for (const listener of messages) listener(packet)
  })
  child.on('exit', (code) => {
    if (exited) return
    exited = true
    for (const listener of exits) listener(code)
  })
  child.stderr?.on('data', (chunk: unknown) => {
    const text = stderrText(chunk)
    if (text.length > 0) console.error(text)
  })

  return {
    send(message) {
      if (exited) return
      const post = child.postMessage.bind(child)
      post(message)
    },
    onMessage(listener) {
      messages.add(listener)
      return () => {
        messages.delete(listener)
      }
    },
    onExit(listener) {
      exits.add(listener)
      return () => {
        exits.delete(listener)
      }
    },
    kill() {
      if (exited) return
      child.kill()
    }
  }
}

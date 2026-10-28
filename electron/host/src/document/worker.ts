import { createDocumentProcessHost } from './host'
import { encodeDocumentFrame, encodeDocumentMessage } from './protocol'

interface UtilityParentPort {
  on(event: 'message', listener: (event: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

function isParentPort(value: unknown): value is UtilityParentPort {
  if (typeof value !== 'object' || value === null) return false
  if (!('on' in value) || !('postMessage' in value)) return false
  return typeof value.on === 'function' && typeof value.postMessage === 'function'
}

function readParentPort(): UtilityParentPort | null {
  const value: unknown = Reflect.get(process, 'parentPort')
  return isParentPort(value) ? value : null
}

const port = readParentPort()
if (port) {
  const host = createDocumentProcessHost({
    frame(update) {
      port.postMessage(encodeDocumentFrame(update))
    },
    tile(packet) {
      port.postMessage(packet)
    }
  })
  port.on('message', (event) => {
    const data = event.data
    if (typeof data !== 'string') {
      port.postMessage(
        encodeDocumentMessage({
          type: 'result',
          requestId: '',
          ok: false,
          reason: 'invalid-message'
        })
      )
      return
    }
    for (const reply of host.handle(data)) port.postMessage(reply)
  })
}

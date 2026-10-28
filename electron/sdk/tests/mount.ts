import { nextTick, h, type VNodeChild } from 'vue'

import type { SessionClient } from '@open-pencil/session'

import { provideSession } from '../src/session'
import { domDocument } from './dom'
import { loadVueFile } from './load-vue'
import { domRenderer } from './renderer'

export async function flushView(): Promise<void> {
  await new Promise<void>(function wait(resolve) {
    setTimeout(resolve, 0)
  })
  await nextTick()
}

export async function mountSessionComponent(
  file: string,
  client: SessionClient,
  props: object,
  slots?: Record<string, () => VNodeChild>
) {
  const component = await loadVueFile(file)
  const host = domDocument.createElement('div')
  domDocument.body.append(host)
  const app = domRenderer.createApp({
    name: 'SessionHost',
    setup() {
      provideSession(client)
      return () => (slots ? h(component, props, slots) : h(component, props))
    }
  })
  app.mount(host)
  await flushView()
  return {
    element: host,
    unmount() {
      app.unmount()
      host.remove()
    }
  }
}

import type { OpenPencilBridge } from './session/bridge'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

declare global {
  interface Window {
    openpencil?: OpenPencilBridge
  }
}

export {}

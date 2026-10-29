import { onMounted, onUnmounted, ref, watch } from 'vue'

import type { LayerRow } from '@open-pencil/session'

import { useSession } from '../session'
import { isRootRow, LAYER_WINDOW_LIMIT, nextLayerOffset, scrollMetrics } from './model'

export interface LayerWindowSource {
  documentId(): string
  parentId(): string | null
  rootsOnly(): boolean
}

export function useLayerWindow(source: LayerWindowSource) {
  const session = useSession()
  const rows = ref<LayerRow[]>([])
  const total = ref(0)
  const offset = ref(0)
  let loadedCount = 0
  let request = 0
  let stopListening: () => void = function unsubscribe() {
    return undefined
  }

  async function load(nextOffset: number): Promise<void> {
    const token = ++request
    const frame = await session.layerTree(source.documentId(), {
      parentId: source.parentId(),
      offset: Math.max(0, nextOffset),
      limit: LAYER_WINDOW_LIMIT
    })
    if (token !== request) return
    loadedCount = frame.rows.length
    offset.value = frame.offset
    total.value = frame.total
    rows.value = source.rootsOnly() ? frame.rows.filter(isRootRow) : frame.rows
  }

  function onScroll(event: Event): void {
    const metrics = scrollMetrics(event)
    if (!metrics) return
    const next = nextLayerOffset(offset.value, loadedCount, total.value, metrics)
    if (next === null) return
    void load(next)
  }

  function reload(): Promise<void> {
    return load(offset.value)
  }

  function listen(): void {
    stopListening()
    stopListening = session.subscribe(source.documentId(), function refresh() {
      void reload()
    })
  }

  function windowSource(): readonly [string, string | null, boolean] {
    return [source.documentId(), source.parentId(), source.rootsOnly()]
  }

  onMounted(function mountWindow() {
    listen()
    void load(0)
  })

  onUnmounted(function unmountWindow() {
    stopListening()
    request += 1
  })

  watch(windowSource, function onWindowSourceChange() {
    listen()
    void load(0)
  })

  return { rows, total, offset, onScroll, reload }
}

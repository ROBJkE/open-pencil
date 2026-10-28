import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'

import type { SelectionProperties, ViewportSummary } from '@open-pencil/session'
import { useSession } from '@open-pencil/vue-next'

const EMPTY_SELECTION: SelectionProperties = { ids: [], fields: {}, mixed: [] }
const EMPTY_VIEWPORT: ViewportSummary = {
  pageId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  width: 0,
  height: 0
}

/**
 * Session projections for the open document.
 * Pages are the root list. Layers are the children of the active page.
 * Stored in shallow refs so Vue does not proxy a scene graph.
 */
export function useDocumentView(documentId: MaybeRefOrGetter<string>) {
  const session = useSession()
  const selection = shallowRef<SelectionProperties>(EMPTY_SELECTION)
  const viewport = shallowRef<ViewportSummary>(EMPTY_VIEWPORT)
  const layerTotal = shallowRef(0)
  const pageCount = shallowRef(0)
  const ready = shallowRef(false)
  let ticket = 0

  async function refresh(): Promise<void> {
    const id = toValue(documentId)
    const current = ++ticket
    if (!id) {
      selection.value = EMPTY_SELECTION
      viewport.value = EMPTY_VIEWPORT
      layerTotal.value = 0
      pageCount.value = 0
      return
    }
    const [nextSelection, nextViewport, roots] = await Promise.all([
      session.selection(id),
      session.viewport(id),
      session.layerTree(id, { parentId: null, offset: 0, limit: 1 })
    ])
    if (current !== ticket) return
    const layers = nextViewport.pageId
      ? await session.layerTree(id, { parentId: nextViewport.pageId, offset: 0, limit: 1 })
      : { total: 0 }
    if (current !== ticket) return
    selection.value = nextSelection
    viewport.value = nextViewport
    pageCount.value = roots.total
    layerTotal.value = layers.total
    if (toValue(documentId) === id) ready.value = true
  }

  const stop = watch(
    () => toValue(documentId),
    (id, _previous, onCleanup) => {
      ready.value = false
      selection.value = EMPTY_SELECTION
      viewport.value = EMPTY_VIEWPORT
      layerTotal.value = 0
      pageCount.value = 0
      const unsubscribe = id
        ? session.subscribe(id, () => {
            void refresh()
          })
        : () => undefined
      onCleanup(unsubscribe)
      void refresh()
    },
    { immediate: true }
  )
  onScopeDispose(stop)

  return { selection, viewport, layerTotal, pageCount, ready, refresh }
}

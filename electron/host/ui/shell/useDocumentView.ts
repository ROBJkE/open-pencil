import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'

import type { SelectionProperties, ViewportSummary } from '@open-pencil/session'
import { useSession } from '@open-pencil/vue-next'

import { leadingPageCount } from '../session/pages'

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
 * Stored in shallow refs so Vue does not proxy a scene graph.
 */
export function useDocumentView(documentId: MaybeRefOrGetter<string>) {
  const session = useSession()
  const selection = shallowRef<SelectionProperties>(EMPTY_SELECTION)
  const viewport = shallowRef<ViewportSummary>(EMPTY_VIEWPORT)
  const total = shallowRef(0)
  const pageCount = shallowRef(0)
  let ticket = 0

  async function refresh(): Promise<void> {
    const id = toValue(documentId)
    const current = ++ticket
    const [nextSelection, nextViewport, probe] = await Promise.all([
      session.selection(id),
      session.viewport(id),
      session.layerTree(id, { parentId: null, offset: 0, limit: 1 })
    ])
    if (current !== ticket) return
    const pages = await leadingPageCount(async (offset) => {
      const window = await session.layerTree(id, { parentId: null, offset, limit: 1 })
      return window.rows[0]
    }, probe.total)
    if (current !== ticket) return
    selection.value = nextSelection
    viewport.value = nextViewport
    total.value = probe.total
    pageCount.value = pages
  }

  const stop = watch(
    () => toValue(documentId),
    (id, _previous, onCleanup) => {
      const unsubscribe = session.subscribe(id, () => {
        void refresh()
      })
      onCleanup(unsubscribe)
      void refresh()
    },
    { immediate: true }
  )
  onScopeDispose(stop)

  return { selection, viewport, total, pageCount, refresh }
}

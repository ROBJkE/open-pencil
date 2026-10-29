export interface DocumentTab {
  id: string
  name: string
}

export function documentSlotAvailable(openCount: number, pending: number, cap: number): boolean {
  return openCount + pending < cap
}

export function nextDocument(serial: number): { serial: number; tab: DocumentTab } {
  const next = serial + 1
  return {
    serial: next,
    tab: { id: `doc-${next}`, name: next === 1 ? 'Untitled' : `Untitled ${next}` }
  }
}

export function closeDocumentTab(
  tabs: readonly DocumentTab[],
  id: string,
  activeId: string
): { tabs: DocumentTab[]; activeId: string } | null {
  if (tabs.length <= 1) return null
  const next = tabs.filter((tab) => tab.id !== id)
  const first = next[0]
  return { tabs: next, activeId: activeId === id ? first.id : activeId }
}

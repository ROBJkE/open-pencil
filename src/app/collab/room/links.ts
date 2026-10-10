export function roomLinkURL(roomId: string): string {
  return `openpencil://join?room=${encodeURIComponent(roomId)}`
}

/** The browser has no desktop link listener. Returns a no-op unsubscribe. */
export async function bindDesktopRoomLinks(
  _open: (roomId: string) => void
): Promise<() => void> {
  return () => undefined
}

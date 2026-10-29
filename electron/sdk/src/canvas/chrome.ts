/** Pointer sample in screen space. The frame draws chrome from these and does not rasterize. */
export interface ScreenPointer {
  x: number
  y: number
  type: 'down' | 'move' | 'up'
}

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

function rectBetween(origin: ScreenPointer, cursor: ScreenPointer): ScreenRect | null {
  const x = Math.min(origin.x, cursor.x)
  const y = Math.min(origin.y, cursor.y)
  const width = Math.abs(cursor.x - origin.x)
  const height = Math.abs(cursor.y - origin.y)
  if (width === 0 && height === 0) return null
  return { x, y, width, height }
}

/** Selection rectangle from the latest pointer gesture, in screen pixels. */
export function selectionChrome(events: readonly ScreenPointer[]): ScreenRect | null {
  let origin: ScreenPointer | null = null
  let cursor: ScreenPointer | null = null
  let finished = false
  for (const event of events) {
    if (event.type === 'down') {
      origin = event
      cursor = event
      finished = false
      continue
    }
    if (!origin || finished) continue
    cursor = event
    if (event.type === 'up') finished = true
  }
  if (!origin || !cursor) return null
  return rectBetween(origin, cursor)
}

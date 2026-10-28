import {
  CLICK_EXTENT,
  hitTest,
  hitsInRect,
  toolCommands,
  type Point,
  type Rect,
  type Viewport
} from '@open-pencil/engine/interaction'
import type { BoundsEntry, CanvasTool, Command } from '@open-pencil/session'

export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

const DRAW_TOOLS = new Set<CanvasTool>([
  'frame',
  'section',
  'rectangle',
  'ellipse',
  'line',
  'polygon',
  'star',
  'text',
  'pen'
])

export interface GestureStart {
  tool: CanvasTool
  pageId: string | null
  index: number
  selection: readonly string[]
  entries: readonly BoundsEntry[]
  viewport: Viewport
  additive: boolean
  id: string
  screen: ScreenPoint
}

export interface LiveGesture extends GestureStart {
  startWorld: Point
  mode: 'move' | 'marquee' | 'pan' | 'zoom' | 'draw'
  hitId: string | null
  origins: ReadonlyArray<{ id: string; x: number; y: number }>
  moved: boolean
}

export function canvasPoint(
  screen: ScreenPoint,
  viewport: { panX: number; panY: number; zoom: number }
): Point {
  const zoom = viewport.zoom === 0 ? 1 : viewport.zoom
  return {
    x: (screen.x - viewport.panX) / zoom,
    y: (screen.y - viewport.panY) / zoom
  }
}

export function pointerMoved(from: Point, to: Point): boolean {
  return Math.abs(to.x - from.x) >= CLICK_EXTENT || Math.abs(to.y - from.y) >= CLICK_EXTENT
}

export function entriesOnPage(
  entries: readonly BoundsEntry[],
  pageId: string | null
): BoundsEntry[] {
  if (pageId === null) return [...entries]
  return entries.filter((entry) => entry.pageId === pageId)
}

export function selectionFrames(
  entries: readonly BoundsEntry[],
  ids: readonly string[],
  viewport: { panX: number; panY: number; zoom: number }
): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  const selected = new Set(ids)
  const zoom = viewport.zoom === 0 ? 1 : viewport.zoom
  const frames: Array<{ id: string; x: number; y: number; width: number; height: number }> = []
  for (const entry of entries) {
    if (!selected.has(entry.id)) continue
    frames.push({
      id: entry.id,
      x: entry.x * zoom + viewport.panX,
      y: entry.y * zoom + viewport.panY,
      width: entry.width * zoom,
      height: entry.height * zoom
    })
  }
  return frames
}

function originsFor(
  entries: readonly BoundsEntry[],
  selection: readonly string[],
  hitId: string | null
): Array<{ id: string; x: number; y: number }> {
  if (!hitId || !selection.includes(hitId)) return []
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const origins: Array<{ id: string; x: number; y: number }> = []
  for (const id of selection) {
    const entry = byId.get(id)
    if (!entry) continue
    origins.push({ id, x: entry.localX ?? entry.x, y: entry.localY ?? entry.y })
  }
  return origins
}

export function beginGesture(start: GestureStart): LiveGesture {
  const world = canvasPoint(start.screen, start.viewport)
  const pageEntries = entriesOnPage(start.entries, start.pageId)
  const hitId = hitTest(pageEntries, world.x, world.y)
  const origins = originsFor(pageEntries, start.selection, hitId)
  let mode: LiveGesture['mode'] = 'marquee'
  if (start.tool === 'hand') mode = 'pan'
  else if (start.tool === 'zoom') mode = 'zoom'
  else if (DRAW_TOOLS.has(start.tool)) mode = 'draw'
  else if (origins.length > 0) mode = 'move'
  return {
    ...start,
    startWorld: world,
    mode,
    hitId,
    origins,
    moved: false
  }
}

function worldRect(from: Point, to: Point): Rect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y)
  }
}

export function gestureCommands(
  gesture: LiveGesture,
  phase: 'preview' | 'commit' | 'cancel',
  screen: ScreenPoint
): Command[] {
  const world = canvasPoint(screen, gesture.viewport)
  const moved = gesture.moved || pointerMoved(gesture.startWorld, world)
  if (phase === 'cancel') {
    if (gesture.mode !== 'move' || !gesture.moved) return []
    return toolCommands(gesture.tool, {
      kind: 'move',
      phase: 'cancel',
      origins: gesture.origins,
      dx: world.x - gesture.startWorld.x,
      dy: world.y - gesture.startWorld.y
    })
  }
  if (gesture.mode === 'draw' || gesture.mode === 'zoom' || gesture.mode === 'marquee') {
    if (phase !== 'commit') return []
  }
  if (gesture.mode === 'move') {
    if (!moved) {
      if (phase !== 'commit') return []
      return toolCommands(gesture.tool, {
        kind: 'click',
        point: world,
        hitId: gesture.hitId,
        selection: gesture.selection,
        additive: gesture.additive
      })
    }
    return toolCommands(gesture.tool, {
      kind: 'move',
      phase,
      origins: gesture.origins,
      dx: world.x - gesture.startWorld.x,
      dy: world.y - gesture.startWorld.y
    })
  }
  if (gesture.mode === 'pan') {
    if (!moved) return []
    return toolCommands(gesture.tool, {
      kind: 'pan',
      dx: screen.x - gesture.screen.x,
      dy: screen.y - gesture.screen.y,
      viewport: gesture.viewport
    })
  }
  if (gesture.mode === 'marquee') {
    if (!moved) {
      return toolCommands(gesture.tool, {
        kind: 'click',
        point: world,
        hitId: gesture.hitId,
        selection: gesture.selection,
        additive: gesture.additive
      })
    }
    const hits = hitsInRect(
      entriesOnPage(gesture.entries, gesture.pageId),
      worldRect(gesture.startWorld, world)
    )
    return toolCommands(gesture.tool, {
      kind: 'marquee',
      phase: 'commit',
      hits,
      selection: gesture.selection,
      additive: gesture.additive
    })
  }
  if (gesture.mode === 'zoom') {
    if (!moved) {
      return toolCommands(gesture.tool, {
        kind: 'zoom',
        factor: gesture.additive ? 0.5 : 2,
        anchor: screen,
        viewport: gesture.viewport
      })
    }
    return toolCommands(gesture.tool, {
      kind: 'draw',
      phase: 'commit',
      id: gesture.id,
      parentId: gesture.pageId,
      index: gesture.index,
      from: gesture.startWorld,
      to: world,
      viewport: gesture.viewport
    })
  }
  if (gesture.tool === 'pen') {
    return toolCommands(gesture.tool, {
      kind: 'pen',
      phase: 'commit',
      id: gesture.id,
      parentId: gesture.pageId,
      index: gesture.index,
      points: [gesture.startWorld, world]
    })
  }
  return toolCommands(gesture.tool, {
    kind: 'draw',
    phase: 'commit',
    id: gesture.id,
    parentId: gesture.pageId,
    index: gesture.index,
    from: gesture.startWorld,
    to: world
  })
}

export function noteMovement(gesture: LiveGesture, screen: ScreenPoint): LiveGesture {
  if (gesture.moved) return gesture
  const world = canvasPoint(screen, gesture.viewport)
  if (!pointerMoved(gesture.startWorld, world)) return gesture
  return { ...gesture, moved: true }
}

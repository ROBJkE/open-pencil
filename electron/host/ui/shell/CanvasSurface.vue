<script setup lang="ts">
import { useElementSize, useEventListener } from '@vueuse/core'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger
} from 'reka-ui'
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue'

import { applySpatialDelta } from '@open-pencil/engine/interaction'
import type { BoundsEntry, Command, DirtyTile } from '@open-pencil/session'
import { CanvasFrame, useSession, type ScreenPointer } from '@open-pencil/vue-next'

import { useMenuUI } from '../menu/menu'
import { readSpatial, subscribeFrame, subscribeTile } from '../session/bridge'
import {
  useActiveTool,
  useBump,
  useDocumentId,
  useDocumentProjection,
  useShellActions,
  useWindowBridge
} from './context'
import {
  beginGesture,
  gestureCommands,
  noteMovement,
  selectionFrames,
  type LiveGesture,
  type ScreenPoint
} from './gestures'
import { messages } from './messages'
import Toolbar from './Toolbar.vue'

const view = useDocumentProjection()
const documentId = useDocumentId()
const tool = useActiveTool()
const actions = useShellActions()
const bump = useBump()
const bridge = useWindowBridge()
const session = useSession()
const menu = useMenuUI({ content: 'min-w-40', item: 'justify-start gap-2' })
const frame = useTemplateRef<HTMLElement>('frame')
const surface = useTemplateRef<HTMLCanvasElement>('surface')
const { width, height } = useElementSize(frame)
const entries = shallowRef<BoundsEntry[]>([])
const samples = ref<ScreenPointer[]>([])
const live = shallowRef<LiveGesture | null>(null)
const tiles = new Map<number, { rect: DirtyTile['rect']; pixels: Uint8Array }>()
let visible = new Set<number>()
let generation = -1
let spatialReady = false
let spatialDirty = false
let paintRequest = 0
let sentWidth = 0
let sentHeight = 0
let sentDocument = ''

const frames = computed(() =>
  selectionFrames(entries.value, view.selection.value.ids, view.viewport.value)
)
const chromeSamples = computed(() => {
  const gesture = live.value
  if (!gesture?.moved) return []
  if (gesture.mode !== 'marquee' && gesture.mode !== 'draw' && gesture.mode !== 'zoom') return []
  return samples.value
})

function clearTiles(): void {
  tiles.clear()
  visible = new Set()
  schedulePaint()
}

function rememberFrame(next: { tiles: DirtyTile[] }): void {
  visible = new Set(next.tiles.map((tile) => tile.id))
  for (const id of tiles.keys()) {
    if (!visible.has(id)) tiles.delete(id)
  }
  for (const tile of next.tiles) {
    const existing = tiles.get(tile.id)
    if (existing) existing.rect = tile.rect
  }
  schedulePaint()
}

function rememberTile(tile: DirtyTile, pixels: Uint8Array): void {
  if (!visible.has(tile.id)) return
  tiles.set(tile.id, { rect: tile.rect, pixels })
  schedulePaint()
}

function schedulePaint(): void {
  if (paintRequest !== 0) return
  paintRequest = requestAnimationFrame(() => {
    paintRequest = 0
    paint()
  })
}

function paint(): void {
  const canvas = surface.value
  if (!canvas) return
  const nextWidth = Math.max(1, Math.round(canvas.clientWidth))
  const nextHeight = Math.max(1, Math.round(canvas.clientHeight))
  if (canvas.width !== nextWidth) canvas.width = nextWidth
  if (canvas.height !== nextHeight) canvas.height = nextHeight
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  for (const tile of tiles.values()) {
    if (tile.rect.width <= 0 || tile.rect.height <= 0) continue
    if (tile.pixels.byteLength !== tile.rect.width * tile.rect.height * 4) continue
    const copy = new Uint8ClampedArray(tile.pixels.byteLength)
    copy.set(tile.pixels)
    context.putImageData(
      new ImageData(copy, tile.rect.width, tile.rect.height),
      tile.rect.x,
      tile.rect.y
    )
  }
}

async function loadSpatial(id: string): Promise<void> {
  spatialReady = false
  const index = await readSpatial(bridge, id)
  if (documentId.value !== id) return
  entries.value = index
  spatialReady = true
  if (!spatialDirty) return
  spatialDirty = false
  await loadSpatial(id)
}

let commandQueue: Promise<void> = Promise.resolve()

async function applyCommands(commands: readonly Command[]): Promise<void> {
  const id = documentId.value
  if (!id || commands.length === 0) return
  for (const command of commands) await session.submit(id, command)
  bump()
}

function run(commands: readonly Command[]): void {
  commandQueue = commandQueue.then(() => applyCommands(commands))
}

function localPoint(event: PointerEvent): ScreenPoint | null {
  const canvas = surface.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function fromToolbar(event: PointerEvent): boolean {
  const target = event.target
  return target instanceof Element && target.closest('[data-test-id="toolbar"]') !== null
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || fromToolbar(event) || live.value) return
  const screen = localPoint(event)
  const canvas = surface.value
  if (!screen || !canvas) return
  const viewport = view.viewport.value
  live.value = beginGesture({
    tool: tool.value,
    pageId: viewport.pageId,
    index: view.layerTotal.value,
    selection: view.selection.value.ids,
    entries: entries.value,
    viewport: {
      zoom: viewport.zoom,
      panX: viewport.panX,
      panY: viewport.panY,
      width: viewport.width,
      height: viewport.height
    },
    additive: event.shiftKey,
    id: crypto.randomUUID(),
    screen
  })
  samples.value = [{ x: screen.x, y: screen.y, type: 'down' }]
  canvas.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  const gesture = live.value
  const screen = localPoint(event)
  if (!gesture || !screen) return
  const next = noteMovement(gesture, screen)
  live.value = next
  samples.value = [...samples.value, { x: screen.x, y: screen.y, type: 'move' }]
  if (!next.moved) return
  void run(gestureCommands(next, 'preview', screen))
}

function onPointerUp(event: PointerEvent): void {
  const gesture = live.value
  const screen = localPoint(event)
  if (!gesture || !screen) return
  live.value = null
  samples.value = []
  void run(gestureCommands(noteMovement(gesture, screen), 'commit', screen))
}

function cancelGesture(event?: PointerEvent): void {
  const gesture = live.value
  if (!gesture) return
  const screen = (event ? localPoint(event) : null) ?? samples.value.at(-1) ?? gesture.screen
  live.value = null
  samples.value = []
  void run(gestureCommands(gesture, 'cancel', screen))
}

watch(
  documentId,
  (id, _previous, onCleanup) => {
    entries.value = []
    generation = -1
    spatialReady = false
    spatialDirty = false
    live.value = null
    samples.value = []
    clearTiles()
    if (!id) return
    const stopFrame = subscribeFrame(bridge, id, rememberFrame)
    const stopTile = subscribeTile(bridge, id, rememberTile)
    const stopSession = session.subscribe(id, (event) => {
      if (event.type === 'recovered') {
        void loadSpatial(id)
        return
      }
      if (event.type !== 'spatial') return
      if (!spatialReady) {
        spatialDirty = true
        return
      }
      if (event.delta.generation < generation) return
      generation = event.delta.generation
      entries.value = applySpatialDelta(entries.value, event.delta)
    })
    void loadSpatial(id)
    onCleanup(() => {
      stopFrame()
      stopTile()
      stopSession()
    })
  },
  { immediate: true }
)

watch([documentId, width, height, () => view.ready.value], () => {
  const id = documentId.value
  const nextWidth = Math.round(width.value)
  const nextHeight = Math.round(height.value)
  if (!view.ready.value || !id || nextWidth <= 0 || nextHeight <= 0) return
  if (id === sentDocument && nextWidth === sentWidth && nextHeight === sentHeight) return
  const viewport = view.viewport.value
  sentDocument = id
  sentWidth = nextWidth
  sentHeight = nextHeight
  run([
    {
      type: 'set-viewport',
      zoom: viewport.zoom,
      panX: viewport.panX,
      panY: viewport.panY,
      width: nextWidth,
      height: nextHeight
    }
  ])
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !live.value) return
  cancelGesture()
})
</script>

<template>
  <ContextMenuRoot :modal="false">
    <ContextMenuTrigger as-child>
      <div
        ref="frame"
        data-test-id="canvas"
        class="relative min-w-0 flex-1 overflow-hidden bg-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="cancelGesture"
        @lostpointercapture="cancelGesture"
      >
        <CanvasFrame class="h-full w-full" :pointer-events="chromeSamples">
          <template #tiles>
            <canvas ref="surface" class="block h-full w-full touch-none" />
            <div
              v-for="item in frames"
              :key="item.id"
              class="pointer-events-none absolute outline outline-1 outline-accent"
              :style="{
                left: `${item.x}px`,
                top: `${item.y}px`,
                width: `${item.width}px`,
                height: `${item.height}px`
              }"
            />
          </template>
        </CanvasFrame>
        <Toolbar />
      </div>
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent :class="menu.content">
        <ContextMenuItem :class="menu.item" @select="actions.undo()">{{
          messages.undo
        }}</ContextMenuItem>
        <ContextMenuItem :class="menu.item" @select="actions.redo()">{{
          messages.redo
        }}</ContextMenuItem>
        <ContextMenuItem :class="menu.item" @select="actions.openSettings()">{{
          messages.settings
        }}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

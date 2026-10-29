import type { CanvasTool, Command, JSONValue } from '@open-pencil/session'

import {
  cancelPreviewCommand,
  commitPreviewCommand,
  createCommand,
  previewCommand,
  type PreviewEdit
} from './commands'
import { draggedBox, lineBox, pathBounds, pathGeometry, textClickBox } from './geometry'
import type { DrawGesture, PenGesture, Point } from './types'

/** Grey the shape tools place, white frames, and black ink. The renderer reads these hex fills. */
const SHAPE_FILL = '#D9D9D9'
const FRAME_FILL = '#FFFFFF'
const INK = '#000000'

const NAMES: Record<string, string> = {
  frame: 'Frame',
  section: 'Section',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  polygon: 'Polygon',
  star: 'Star',
  text: 'Text',
  path: 'Path'
}

const BOX_TYPE: Partial<Record<CanvasTool, string>> = {
  frame: 'frame',
  section: 'section',
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  line: 'line',
  polygon: 'polygon',
  star: 'star',
  text: 'text'
}

interface Placement {
  readonly geometry: Record<string, JSONValue>
  readonly fields: Record<string, JSONValue>
}

export function drawCommands(tool: CanvasTool, gesture: DrawGesture | PenGesture): Command[] {
  if (gesture.kind === 'pen') {
    if (tool !== 'pen' && tool !== 'vector') return []
    return penCommands(gesture)
  }
  if (tool === 'pen') return penDrag(gesture)
  return shapeCommands(tool, gesture)
}

function shapeCommands(tool: CanvasTool, gesture: DrawGesture): Command[] {
  const type = BOX_TYPE[tool]
  if (!type) return []
  if (gesture.phase === 'cancel') return [cancelPreviewCommand()]
  const placed = placeShape(type, gesture)
  if (!placed) return []
  if (gesture.phase === 'preview') return [previewOf(gesture.id, placed.geometry)]
  return [createCommand(gesture, type, placed.fields)]
}

function penDrag(gesture: DrawGesture): Command[] {
  if (gesture.phase === 'cancel') return [cancelPreviewCommand()]
  const line = lineBox(gesture.from, gesture.to, gesture.constrain === true)
  if (!line || line.clicked) return []
  const end = gesture.constrain === true ? endOf(line) : gesture.to
  return penCommands({
    kind: 'pen',
    phase: gesture.phase,
    id: gesture.id,
    parentId: gesture.parentId,
    index: gesture.index,
    points: [gesture.from, end]
  })
}

function penCommands(gesture: PenGesture): Command[] {
  if (gesture.phase === 'cancel') return [cancelPreviewCommand()]
  if (gesture.editing && gesture.phase === 'commit') return [commitPreviewCommand()]
  const geometry = pathFields(gesture.points, gesture.closed === true)
  if (!geometry) return []
  if (gesture.phase === 'preview') return [previewOf(gesture.id, geometry)]
  if (gesture.points.length < 2) return []
  return [
    createCommand(gesture, 'path', {
      name: 'Path',
      ...geometry,
      stroke: INK,
      strokeWidth: 2
    })
  ]
}

function placeShape(type: string, gesture: DrawGesture): Placement | null {
  if (type === 'line') return placeLine(gesture)
  const box = draggedBox(gesture.from, gesture.to, gesture.constrain === true)
  if (!box) return null
  const sized = type === 'text' && box.clicked ? textClickBox(gesture.from) : box
  const geometry = { x: sized.x, y: sized.y, width: sized.width, height: sized.height }
  return {
    geometry,
    fields: { name: nodeName(type), ...geometry, ...appearance(type, sized.clicked) }
  }
}

function placeLine(gesture: DrawGesture): Placement | null {
  const line = lineBox(gesture.from, gesture.to, gesture.constrain === true)
  if (!line) return null
  const geometry = {
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
    rotation: line.rotation
  }
  return {
    geometry,
    fields: { name: 'Line', ...geometry, stroke: INK, strokeWidth: 1 }
  }
}

function pathFields(points: readonly Point[], closed: boolean): Record<string, JSONValue> | null {
  const bounds = pathBounds(points)
  if (!bounds) return null
  const geometry = pathGeometry(points, closed)
  if (geometry.length === 0) return null
  return { ...bounds, geometry }
}

function appearance(type: string, clicked: boolean): Record<string, JSONValue> {
  if (type === 'frame') return { fill: FRAME_FILL, clip: true }
  if (type === 'section') return { fill: FRAME_FILL, cornerRadius: 2 }
  if (type === 'polygon') return { fill: SHAPE_FILL, polygonCount: 3 }
  if (type === 'text') {
    return { fill: INK, content: '', textGrowth: clicked ? 'auto' : 'fixed-width-height' }
  }
  if (type === 'rectangle' || type === 'ellipse' || type === 'star') return { fill: SHAPE_FILL }
  return {}
}

function nodeName(type: string): string {
  if (Object.hasOwn(NAMES, type)) return NAMES[type] ?? type
  return type
}

function previewOf(
  id: string,
  fields: Record<string, JSONValue>
): ReturnType<typeof previewCommand> {
  const edit: PreviewEdit = { id, fields }
  return previewCommand([edit])
}

function endOf(line: { x: number; y: number; width: number; rotation: number }): Point {
  const radians = (line.rotation * Math.PI) / 180
  return {
    x: line.x + Math.cos(radians) * line.width,
    y: line.y + Math.sin(radians) * line.width
  }
}

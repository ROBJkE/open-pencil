import type { TileRect } from '@open-pencil/session'
import type { Canvas, CanvasKit, Paint, Shader } from 'canvaskit-wasm'

import type { DrawnNode, DrawnPaint, DrawnStroke, GradientStop } from './scene'

type GradientPaint = Exclude<DrawnPaint, { kind: 'solid' }>

function sharp(node: DrawnNode): boolean {
  return node.kind === 'rect' && node.radii.every((radius) => radius === 0)
}

function drawable(node: DrawnNode): boolean {
  if (node.kind === 'line') return node.width !== 0 || node.height !== 0
  return node.width > 0 && node.height > 0
}

function radiiRect(node: DrawnNode): number[] {
  const [topLeft, topRight, bottomRight, bottomLeft] = node.radii
  return [
    0,
    0,
    node.width,
    node.height,
    topLeft,
    topLeft,
    topRight,
    topRight,
    bottomRight,
    bottomRight,
    bottomLeft,
    bottomLeft
  ]
}

function drawOutline(ck: CanvasKit, canvas: Canvas, node: DrawnNode, paint: Paint): void {
  if (node.kind === 'line') {
    canvas.drawLine(0, 0, node.width, node.height, paint)
    return
  }
  if (node.kind === 'ellipse') {
    canvas.drawOval(ck.XYWHRect(0, 0, node.width, node.height), paint)
    return
  }
  if (sharp(node)) {
    canvas.drawRect(ck.XYWHRect(0, 0, node.width, node.height), paint)
    return
  }
  canvas.drawRRect(radiiRect(node), paint)
}

function clipOutline(ck: CanvasKit, canvas: Canvas, node: DrawnNode, difference: boolean): void {
  const op = difference ? ck.ClipOp.Difference : ck.ClipOp.Intersect
  const alias = !sharp(node)
  if (node.kind === 'ellipse') {
    const path = new ck.PathBuilder()
      .addOval(ck.XYWHRect(0, 0, node.width, node.height))
      .detachAndDelete()
    try {
      canvas.clipPath(path, op, alias)
    } finally {
      path.delete()
    }
    return
  }
  if (node.kind === 'line') return
  canvas.clipRRect(radiiRect(node), op, alias)
}

function strokeAligned(
  ck: CanvasKit,
  canvas: Canvas,
  node: DrawnNode,
  paint: Paint,
  align: DrawnStroke['align']
): void {
  if (align === 'center' || node.kind === 'line') {
    drawOutline(ck, canvas, node, paint)
    return
  }
  canvas.save()
  clipOutline(ck, canvas, node, align === 'outside')
  drawOutline(ck, canvas, node, paint)
  canvas.restore()
}

function stopColors(ck: CanvasKit, stops: readonly GradientStop[]): Float32Array[] {
  return stops.map((stop) => ck.Color4f(stop.red, stop.green, stop.blue, stop.alpha))
}

function radialMatrix(rx: number, ry: number, cy: number): number[] | undefined {
  if (!(rx > 0) || !(ry > 0) || Math.abs(rx - ry) < 1e-6) return undefined
  const scale = rx / ry
  return [1, 0, 0, 0, scale, cy - cy * scale, 0, 0, 1]
}

function shaderFor(ck: CanvasKit, source: GradientPaint, node: DrawnNode): Shader | null {
  const colors = stopColors(ck, source.stops)
  const positions = source.stops.map((stop) => stop.position)
  if (colors.length === 0) return null
  if (source.kind === 'linear') {
    return ck.Shader.MakeLinearGradient(
      [source.x0 * node.width, source.y0 * node.height],
      [source.x1 * node.width, source.y1 * node.height],
      colors,
      positions,
      ck.TileMode.Clamp
    )
  }
  const cx = source.cx * node.width
  const cy = source.cy * node.height
  if (source.kind === 'sweep') {
    return ck.Shader.MakeSweepGradient(
      cx,
      cy,
      colors,
      positions,
      ck.TileMode.Clamp,
      null,
      0,
      source.startAngle,
      source.startAngle + 360
    )
  }
  const rx = source.rx * node.width
  const ry = source.ry * node.height
  if (!(rx > 0) || !(ry > 0)) return null
  return ck.Shader.MakeRadialGradient(
    [cx, cy],
    rx,
    colors,
    positions,
    ck.TileMode.Clamp,
    radialMatrix(rx, ry, cy)
  )
}

function colorize(ck: CanvasKit, paint: Paint, source: DrawnPaint, node: DrawnNode): boolean {
  if (source.kind === 'solid') {
    paint.setColor(ck.Color4f(source.red, source.green, source.blue, source.alpha))
    return true
  }
  const shader = shaderFor(ck, source, node)
  if (!shader) return false
  try {
    paint.setShader(shader)
  } finally {
    shader.delete()
  }
  return true
}

function strokeWidth(node: DrawnNode, stroke: DrawnStroke): number {
  if (node.kind === 'line' || stroke.align === 'center') return stroke.width
  return stroke.width * 2
}

function drawPaint(
  ck: CanvasKit,
  canvas: Canvas,
  node: DrawnNode,
  source: DrawnPaint,
  style: 'fill' | 'stroke',
  stroke?: DrawnStroke
): void {
  const paint = new ck.Paint()
  try {
    paint.setAntiAlias(!sharp(node))
    paint.setDither(false)
    paint.setStyle(style === 'fill' ? ck.PaintStyle.Fill : ck.PaintStyle.Stroke)
    if (stroke) {
      paint.setStrokeWidth(strokeWidth(node, stroke))
      paint.setStrokeCap(strokeCap(ck, stroke.cap))
      paint.setStrokeJoin(strokeJoin(ck, stroke.join))
    }
    if (!colorize(ck, paint, source, node)) return
    if (stroke) strokeAligned(ck, canvas, node, paint, stroke.align)
    else drawOutline(ck, canvas, node, paint)
  } finally {
    paint.delete()
  }
}

function strokeCap(ck: CanvasKit, cap: DrawnStroke['cap']) {
  if (cap === 'round') return ck.StrokeCap.Round
  if (cap === 'square') return ck.StrokeCap.Square
  return ck.StrokeCap.Butt
}

function strokeJoin(ck: CanvasKit, join: DrawnStroke['join']) {
  if (join === 'bevel') return ck.StrokeJoin.Bevel
  if (join === 'round') return ck.StrokeJoin.Round
  return ck.StrokeJoin.Miter
}

function drawFills(ck: CanvasKit, canvas: Canvas, node: DrawnNode): void {
  if (!drawable(node)) return
  for (const fill of node.fills) drawPaint(ck, canvas, node, fill, 'fill')
}

function drawStrokes(ck: CanvasKit, canvas: Canvas, node: DrawnNode): void {
  if (!drawable(node)) return
  for (const stroke of node.strokes) drawPaint(ck, canvas, node, stroke.paint, 'stroke', stroke)
}

function drawChildren(ck: CanvasKit, canvas: Canvas, node: DrawnNode): void {
  if (node.children.length === 0) return
  if (!node.clip) {
    for (const child of node.children) drawNode(ck, canvas, child)
    return
  }
  canvas.save()
  clipOutline(ck, canvas, node, false)
  for (const child of node.children) drawNode(ck, canvas, child)
  canvas.restore()
}

function pushOpacity(ck: CanvasKit, canvas: Canvas, opacity: number): void {
  const paint = new ck.Paint()
  try {
    paint.setAlphaf(opacity)
    canvas.saveLayer(paint)
  } finally {
    paint.delete()
  }
}

function drawNode(ck: CanvasKit, canvas: Canvas, node: DrawnNode): void {
  canvas.save()
  canvas.translate(node.x, node.y)
  if (node.rotation !== 0) canvas.rotate(node.rotation, node.width / 2, node.height / 2)
  const layer = node.opacity < 1
  if (layer) pushOpacity(ck, canvas, node.opacity)
  drawFills(ck, canvas, node)
  drawChildren(ck, canvas, node)
  drawStrokes(ck, canvas, node)
  if (layer) canvas.restore()
  canvas.restore()
}

/** Records the scene in world space. The recorder is deleted before this returns; the picture is not. */
export function recordScene(ck: CanvasKit, nodes: readonly DrawnNode[], cull: TileRect | null) {
  const bounds = cull ?? { x: 0, y: 0, width: 1, height: 1 }
  const recorder = new ck.PictureRecorder()
  try {
    const canvas = recorder.beginRecording(
      ck.LTRBRect(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height)
    )
    for (const node of nodes) drawNode(ck, canvas, node)
    return recorder.finishRecordingAsPicture()
  } finally {
    recorder.delete()
  }
}

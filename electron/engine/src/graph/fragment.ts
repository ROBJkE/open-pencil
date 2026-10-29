import * as v from 'valibot'

import type { ApplyResult, GraphNode, JSONValue } from '@open-pencil/session'
import { jsonValueSchema } from '@open-pencil/session/schema'

import type { DocumentStore } from './store'

const FRAGMENT_VERSION = 1 as const

const EMPTY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0" width="0" height="0"></svg>'

interface FragmentInput {
  id: string
  type: string
  fields?: Record<string, JSONValue>
  passthrough?: Record<string, JSONValue>
  children?: FragmentInput[]
}

/**
 * One node in a `.pen`-like clipboard fragment: identity, field bag, unknown keys, and children.
 * This is the in-app exchange shape. It is not a pen.dev 2.21 document; the `.pen` codec owns that.
 */
export interface FragmentNode {
  id: string
  type: string
  fields: Record<string, JSONValue>
  passthrough: Record<string, JSONValue>
  children: FragmentNode[]
}

export interface ClipboardFragment {
  /**
   * JSON text `{ version: 1, children: FragmentNode[] }`.
   * `pasteFragment` validates this text and inserts the tree as one undo step.
   */
  text: string
  /** Axis-aligned rectangles and ellipses from the copied subtrees. */
  svg: string
  /**
   * Raster PNG bytes. Always `null`: this layer has no raster encoder, so a PNG
   * clipboard flavor is not produced until the document process can render.
   */
  png: null
}

const jsonRecordSchema: v.GenericSchema<unknown, Record<string, JSONValue>> = v.pipe(
  v.unknown(),
  v.check((value) => typeof value === 'object' && value !== null && !Array.isArray(value)),
  v.record(v.string(), jsonValueSchema)
)

const fragmentNodeSchema: v.GenericSchema<unknown, FragmentInput> = v.lazy(() =>
  v.object({
    id: v.pipe(v.string(), v.minLength(1)),
    type: v.pipe(v.string(), v.minLength(1)),
    fields: v.optional(jsonRecordSchema),
    passthrough: v.optional(jsonRecordSchema),
    children: v.optional(v.array(fragmentNodeSchema))
  })
)

const penFragmentSchema = v.object({
  version: v.literal(FRAGMENT_VERSION),
  children: v.array(fragmentNodeSchema)
})

interface DrawnShape {
  kind: 'rect' | 'ellipse'
  x: number
  y: number
  width: number
  height: number
  fill: string | null
}

function normalize(node: FragmentInput): FragmentNode {
  const fields: Record<string, JSONValue> = { ...node.fields }
  const passthrough: Record<string, JSONValue> = { ...node.passthrough }
  return {
    id: node.id,
    type: node.type,
    fields,
    passthrough,
    children: (node.children ?? []).map(normalize)
  }
}

function rootsOf(store: DocumentStore, ids: readonly string[]): string[] {
  const wanted = new Set(ids)
  const roots: string[] = []
  for (const id of ids) {
    if (roots.includes(id) || !store.nodes.has(id)) continue
    if (ancestorSelected(store, id, wanted)) continue
    roots.push(id)
  }
  return roots
}

function ancestorSelected(store: DocumentStore, id: string, wanted: ReadonlySet<string>): boolean {
  let parentId = store.nodes.get(id)?.parentId ?? null
  while (parentId !== null) {
    if (wanted.has(parentId)) return true
    parentId = store.nodes.get(parentId)?.parentId ?? null
  }
  return false
}

function readFragment(store: DocumentStore, id: string): FragmentNode | null {
  const node = store.getNode(id)
  if (!node) return null
  const children: FragmentNode[] = []
  for (const childId of node.childIds) {
    const child = readFragment(store, childId)
    if (child) children.push(child)
  }
  return {
    id: node.id,
    type: node.type,
    fields: node.fields,
    passthrough: node.passthrough,
    children
  }
}

function freshId(requested: string, used: Set<string>): string {
  if (!used.has(requested)) {
    used.add(requested)
    return requested
  }
  let next = crypto.randomUUID()
  while (used.has(next)) next = crypto.randomUUID()
  used.add(next)
  return next
}

function placeNode(node: FragmentNode, parentId: string | null, used: Set<string>): GraphNode[] {
  const id = freshId(node.id, used)
  const childPlacements = node.children.map((child) => placeNode(child, id, used))
  const graphNode: GraphNode = {
    id,
    type: node.type,
    parentId,
    childIds: childPlacements.map((placed) => placed[0].id),
    fields: { ...node.fields },
    passthrough: { ...node.passthrough }
  }
  return [graphNode, ...childPlacements.flat()]
}

function placeForest(
  store: DocumentStore,
  parentId: string | null,
  nodes: readonly FragmentNode[]
): GraphNode[] {
  const used = new Set(store.nodes.keys())
  return nodes.flatMap((node) => placeNode(node, parentId, used))
}

function finiteNumber(value: JSONValue | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function collectShapes(
  nodes: readonly FragmentNode[],
  originX: number,
  originY: number,
  shapes: DrawnShape[]
): void {
  for (const node of nodes) {
    const x = originX + (finiteNumber(node.fields.x) ?? 0)
    const y = originY + (finiteNumber(node.fields.y) ?? 0)
    const width = finiteNumber(node.fields.width)
    const height = finiteNumber(node.fields.height)
    if (
      (node.type === 'rectangle' || node.type === 'ellipse') &&
      width !== null &&
      height !== null &&
      width >= 0 &&
      height >= 0
    ) {
      const fill = node.fields.fill
      shapes.push({
        kind: node.type === 'ellipse' ? 'ellipse' : 'rect',
        x,
        y,
        width,
        height,
        fill: typeof fill === 'string' ? fill : null
      })
    }
    collectShapes(node.children, x, y, shapes)
  }
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;')
}

function formatCoordinate(value: number): string {
  if (Object.is(value, -0)) return '0'
  return String(value)
}

function renderShape(shape: DrawnShape): string {
  const fill = shape.fill === null ? '' : ` fill="${escapeAttr(shape.fill)}"`
  if (shape.kind === 'rect') {
    const x = formatCoordinate(shape.x)
    const y = formatCoordinate(shape.y)
    const width = formatCoordinate(shape.width)
    const height = formatCoordinate(shape.height)
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}"${fill}/>`
  }
  const cx = formatCoordinate(shape.x + shape.width / 2)
  const cy = formatCoordinate(shape.y + shape.height / 2)
  const rx = formatCoordinate(shape.width / 2)
  const ry = formatCoordinate(shape.height / 2)
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${fill}/>`
}

function renderSVG(nodes: readonly FragmentNode[]): string {
  const shapes: DrawnShape[] = []
  collectShapes(nodes, 0, 0, shapes)
  if (shapes.length === 0) return EMPTY_SVG
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const shape of shapes) {
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.width)
    maxY = Math.max(maxY, shape.y + shape.height)
  }
  const box = [minX, minY, maxX - minX, maxY - minY].map(formatCoordinate).join(' ')
  const width = formatCoordinate(maxX - minX)
  const height = formatCoordinate(maxY - minY)
  const body = shapes.map(renderShape).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${width}" height="${height}">${body}</svg>`
}

/**
 * Copies `ids` and their descendants. A node is skipped when an ancestor is also requested.
 * `png` is null because this layer does not rasterize.
 */
export function copyFragment(store: DocumentStore, ids: readonly string[]): ClipboardFragment {
  const children = rootsOf(store, ids).flatMap((id) => {
    const node = readFragment(store, id)
    return node ? [node] : []
  })
  return {
    text: JSON.stringify({ version: FRAGMENT_VERSION, children }),
    svg: renderSVG(children),
    png: null
  }
}

/** Validates `text` as a fragment and inserts it under `parentId` as one undo step. */
export function pasteFragment(
  store: DocumentStore,
  parentId: string | null,
  index: number,
  text: string
): ApplyResult {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), penFragmentSchema), text)
  if (!parsed.success) return { ack: store.fail('invalid-fragment'), events: [] }
  const children = parsed.output.children.map(normalize)
  return store.insertFragment(parentId, index, placeForest(store, parentId, children))
}

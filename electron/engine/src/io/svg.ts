import type { Command, GraphNode, JSONValue } from '@open-pencil/session'

import { finiteNumber, formatCoordinate } from './values'

const EMPTY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0" width="0" height="0"></svg>'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface Markup {
  element: string
  box: Box
}

interface FoundTag {
  name: string
  attrs: ReadonlyMap<string, string>
  text: string
  next: number
}

/** SVG for rectangle, ellipse, and text nodes. Other node types are skipped. */
export function exportSVG(nodes: readonly GraphNode[]): string {
  const marks: Markup[] = []
  for (const node of nodes) {
    const mark = markup(node)
    if (mark) marks.push(mark)
  }
  if (marks.length === 0) return EMPTY_SVG
  const box = union(marks.map((mark) => mark.box))
  if (!box) return EMPTY_SVG
  return svgDocument(marks.map((mark) => mark.element).join(''), box)
}

/**
 * Rectangle and ellipse elements become `create` commands.
 * Text elements are included so an exported label imports as a text node.
 * Shapes inside groups are flattened to the paste root.
 */
export function importSVG(source: string): Command[] {
  const commands: Command[] = []
  for (const tag of scanShapes(source)) {
    const command = shapeCommand(tag, commands.length)
    if (command) commands.push(command)
  }
  return commands
}

function markup(node: GraphNode): Markup | undefined {
  if (node.type === 'rectangle' && sized(node))
    return { element: rectElement(node), box: boxOf(node) }
  if (node.type === 'ellipse' && sized(node))
    return { element: ellipseElement(node), box: boxOf(node) }
  if (node.type === 'text') return { element: textElement(node), box: boxOf(node) }
  return undefined
}

function sized(node: GraphNode): boolean {
  return (
    finiteNumber(node.fields.width) !== undefined && finiteNumber(node.fields.height) !== undefined
  )
}

function boxOf(node: GraphNode): Box {
  return {
    x: finiteNumber(node.fields.x) ?? 0,
    y: finiteNumber(node.fields.y) ?? 0,
    width: finiteNumber(node.fields.width) ?? 0,
    height: finiteNumber(node.fields.height) ?? 0
  }
}

function rectElement(node: GraphNode): string {
  return emptyTag('rect', [
    `id="${escapeAttr(node.id)}"`,
    `x="${coord(node.fields.x)}"`,
    `y="${coord(node.fields.y)}"`,
    `width="${coord(node.fields.width)}"`,
    `height="${coord(node.fields.height)}"`,
    ...fillAttrs(node.fields)
  ])
}

function ellipseElement(node: GraphNode): string {
  const x = finiteNumber(node.fields.x) ?? 0
  const y = finiteNumber(node.fields.y) ?? 0
  const width = finiteNumber(node.fields.width) ?? 0
  const height = finiteNumber(node.fields.height) ?? 0
  return emptyTag('ellipse', [
    `id="${escapeAttr(node.id)}"`,
    `cx="${formatCoordinate(x + width / 2)}"`,
    `cy="${formatCoordinate(y + height / 2)}"`,
    `rx="${formatCoordinate(width / 2)}"`,
    `ry="${formatCoordinate(height / 2)}"`,
    ...fillAttrs(node.fields)
  ])
}

function textElement(node: GraphNode): string {
  const attrs = [
    `id="${escapeAttr(node.id)}"`,
    `x="${coord(node.fields.x)}"`,
    `y="${coord(node.fields.y)}"`
  ]
  const fontSize = finiteNumber(node.fields.fontSize)
  if (fontSize !== undefined) attrs.push(`font-size="${formatCoordinate(fontSize)}"`)
  if (typeof node.fields.fontFamily === 'string') {
    attrs.push(`font-family="${escapeAttr(node.fields.fontFamily)}"`)
  }
  attrs.push(...fillAttrs(node.fields))
  const width = finiteNumber(node.fields.width)
  const height = finiteNumber(node.fields.height)
  if (width !== undefined) attrs.push(`width="${formatCoordinate(width)}"`)
  if (height !== undefined) attrs.push(`height="${formatCoordinate(height)}"`)
  attrs.push('dominant-baseline="text-before-edge"')
  const content = typeof node.fields.content === 'string' ? escapeText(node.fields.content) : ''
  return `<text ${attrs.join(' ')}>${content}</text>`
}

function fillAttrs(fields: Record<string, JSONValue>): string[] {
  if (typeof fields.fill !== 'string') return []
  return [`fill="${escapeAttr(fields.fill)}"`]
}

function coord(value: JSONValue | undefined): string {
  return formatCoordinate(finiteNumber(value) ?? 0)
}

function emptyTag(name: string, attrs: readonly string[]): string {
  const body = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
  return `<${name}${body} />`
}

function svgDocument(body: string, box: Box): string {
  const viewBox = [box.x, box.y, box.width, box.height].map(formatCoordinate).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${formatCoordinate(box.width)}" height="${formatCoordinate(box.height)}">${body}</svg>`
}

function union(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const box of boxes) {
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width)
    maxY = Math.max(maxY, box.y + box.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function scanShapes(source: string): FoundTag[] {
  const found: FoundTag[] = []
  let index = 0
  while (index < source.length) {
    const tag = readTag(source, index)
    if (!tag) break
    index = Math.max(tag.next, index + 1)
    if (tag.name === 'rect' || tag.name === 'ellipse' || tag.name === 'text') found.push(tag)
  }
  return found
}

function readTag(source: string, from: number): FoundTag | undefined {
  const start = source.indexOf('<', from)
  if (start === -1) return undefined
  if (
    source.startsWith('</', start) ||
    source.startsWith('<!', start) ||
    source.startsWith('<?', start)
  ) {
    const end = source.indexOf('>', start)
    return { name: '', attrs: new Map(), text: '', next: end === -1 ? source.length : end + 1 }
  }
  const end = source.indexOf('>', start)
  if (end === -1) return undefined
  const raw = source.slice(start + 1, end).trim()
  const selfClosing = raw.endsWith('/')
  const body = selfClosing ? raw.slice(0, -1).trim() : raw
  const name = localName(body)
  let next = end + 1
  let text = ''
  if (!selfClosing && name === 'text') {
    const close = source.indexOf('</text>', next)
    if (close !== -1) {
      text = unescapeXML(source.slice(next, close))
      next = close + '</text>'.length
    }
  }
  return { name, attrs: attributes(body), text, next }
}

function localName(body: string): string {
  const match = /^([A-Za-z][\w:.-]*)/.exec(body)
  const token = match?.[1]
  if (!token) return ''
  const colon = token.lastIndexOf(':')
  const name = colon === -1 ? token : token.slice(colon + 1)
  return name.toLowerCase()
}

function attributes(source: string): Map<string, string> {
  const attrs = new Map<string, string>()
  readAttributes(attrs, source, /([^\s=/>]+)\s*=\s*"([^"]*)"/g)
  readAttributes(attrs, source, /([^\s=/>]+)\s*=\s*'([^']*)'/g)
  return attrs
}

function readAttributes(attrs: Map<string, string>, source: string, pattern: RegExp): void {
  for (const match of source.matchAll(pattern)) {
    attrs.set(match[1], unescapeXML(match[2]))
  }
}

function shapeCommand(tag: FoundTag, index: number): Command | undefined {
  if (tag.name === 'rect') return rectangleCommand(tag, index)
  if (tag.name === 'ellipse') return ellipseCommand(tag, index)
  return textCommand(tag, index)
}

function rectangleCommand(tag: FoundTag, index: number): Command | undefined {
  const width = readNumber(tag.attrs, 'width')
  const height = readNumber(tag.attrs, 'height')
  if (width === undefined || height === undefined) return undefined
  return createCommand(index, nodeId(tag.attrs), 'rectangle', {
    x: readNumber(tag.attrs, 'x') ?? 0,
    y: readNumber(tag.attrs, 'y') ?? 0,
    width,
    height,
    ...fillField(tag.attrs)
  })
}

function ellipseCommand(tag: FoundTag, index: number): Command | undefined {
  const rx = readNumber(tag.attrs, 'rx')
  const ry = readNumber(tag.attrs, 'ry')
  if (rx === undefined || ry === undefined) return undefined
  const cx = readNumber(tag.attrs, 'cx') ?? 0
  const cy = readNumber(tag.attrs, 'cy') ?? 0
  return createCommand(index, nodeId(tag.attrs), 'ellipse', {
    x: cx - rx,
    y: cy - ry,
    width: rx * 2,
    height: ry * 2,
    ...fillField(tag.attrs)
  })
}

function textCommand(tag: FoundTag, index: number): Command | undefined {
  const fields: Record<string, JSONValue> = {
    x: readNumber(tag.attrs, 'x') ?? 0,
    y: readNumber(tag.attrs, 'y') ?? 0,
    content: tag.text
  }
  const fontSize = readNumber(tag.attrs, 'font-size')
  if (fontSize !== undefined) fields.fontSize = fontSize
  const fontFamily = tag.attrs.get('font-family')
  if (fontFamily !== undefined && fontFamily.length > 0) fields.fontFamily = fontFamily
  const width = readNumber(tag.attrs, 'width')
  const height = readNumber(tag.attrs, 'height')
  if (width !== undefined) fields.width = width
  if (height !== undefined) fields.height = height
  const fill = fillField(tag.attrs)
  if (fill.fill !== undefined) fields.fill = fill.fill
  return createCommand(index, nodeId(tag.attrs), 'text', fields)
}

function fillField(attrs: ReadonlyMap<string, string>): { fill?: string } {
  const fill = attrs.get('fill')
  if (fill === undefined || fill.length === 0 || fill === 'none') return {}
  return { fill }
}

function readNumber(attrs: ReadonlyMap<string, string>, name: string): number | undefined {
  const raw = attrs.get(name)
  if (raw === undefined) return undefined
  const parsed = Number(raw.trim())
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

function nodeId(attrs: ReadonlyMap<string, string>): string | undefined {
  const id = attrs.get('id')
  if (id === undefined || id.length === 0) return undefined
  return id
}

function createCommand(
  index: number,
  id: string | undefined,
  type: string,
  fields: Record<string, JSONValue>
): Command {
  if (id === undefined) return { type: 'create', parentId: null, index, node: { type, fields } }
  return { type: 'create', parentId: null, index, node: { id, type, fields } }
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

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function unescapeXML(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#10;', '\n')
    .replaceAll('&#13;', '\r')
    .replaceAll('&amp;', '&')
}

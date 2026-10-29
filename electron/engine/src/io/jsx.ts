import type { GraphNode, JSONValue } from '@open-pencil/session'

import { finiteNumber, formatCoordinate } from './values'

/** A function that returns one element, or a fragment, with a style object per node. */
export function exportJSX(nodes: readonly GraphNode[]): string {
  const elements: string[] = []
  for (const node of nodes) {
    const element = elementFor(node)
    if (element) elements.push(element)
  }
  return wrap(elements)
}

function elementFor(node: GraphNode): string | undefined {
  if (node.type === 'rectangle') return `<div data-kind="rectangle" style=${styleOf(node)} />`
  if (node.type === 'ellipse') return `<div data-kind="ellipse" style=${styleOf(node)} />`
  if (node.type === 'text') {
    const content = typeof node.fields.content === 'string' ? jsxText(node.fields.content) : ''
    return `<p data-kind="text" style=${styleOf(node)}>${content}</p>`
  }
  return undefined
}

function styleOf(node: GraphNode): string {
  const props = [
    'position: "absolute"',
    `left: ${coord(node.fields.x)}`,
    `top: ${coord(node.fields.y)}`
  ]
  const width = finiteNumber(node.fields.width)
  const height = finiteNumber(node.fields.height)
  if (width !== undefined) props.push(`width: ${formatCoordinate(width)}`)
  if (height !== undefined) props.push(`height: ${formatCoordinate(height)}`)
  if (node.type === 'ellipse') props.push('borderRadius: "50%"')
  pushTextStyle(props, node)
  pushFill(props, node)
  return `{{ ${props.join(', ')} }}`
}

function pushTextStyle(props: string[], node: GraphNode): void {
  if (node.type !== 'text') return
  const fontSize = finiteNumber(node.fields.fontSize)
  if (fontSize !== undefined) props.push(`fontSize: ${formatCoordinate(fontSize)}`)
  if (typeof node.fields.fontFamily === 'string')
    props.push(`fontFamily: ${jsString(node.fields.fontFamily)}`)
}

function pushFill(props: string[], node: GraphNode): void {
  if (typeof node.fields.fill !== 'string') return
  const key = node.type === 'text' ? 'color' : 'background'
  props.push(`${key}: ${jsString(node.fields.fill)}`)
}

function coord(value: JSONValue | undefined): string {
  return formatCoordinate(finiteNumber(value) ?? 0)
}

function wrap(elements: readonly string[]): string {
  if (elements.length === 0) return 'export function Design() {\n  return <></>\n}\n'
  if (elements.length === 1) {
    return `export function Design() {\n  return (\n    ${elements[0]}\n  )\n}\n`
  }
  const body = elements.map((element) => `      ${element}`).join('\n')
  return `export function Design() {\n  return (\n    <>\n${body}\n    </>\n  )\n}\n`
}

function jsString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function jsxText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
}

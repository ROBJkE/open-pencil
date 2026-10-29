import type { GraphNode, JSONValue } from '@open-pencil/session'

import type { LayoutBox } from './types'

/** Stack direction a `.pen` `layout` string names. A frame with no `layout` is a row. */
export type LayoutMode = 'none' | 'row' | 'column' | 'grid'

export type MainAlign = 'start' | 'center' | 'end' | 'space-between' | 'space-around'

export type CrossAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline'

export interface SizeSpec {
  readonly mode: 'fixed' | 'hug' | 'fill'
  readonly value: number | undefined
}

export interface Edges {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

const LAYOUT_MODES = new Map<string, LayoutMode>([
  ['row', 'row'],
  ['horizontal', 'row'],
  ['column', 'column'],
  ['col', 'column'],
  ['vertical', 'column'],
  ['grid', 'grid'],
  ['none', 'none']
])

const MAIN_ALIGNS = new Map<string, MainAlign>([
  ['start', 'start'],
  ['flex-start', 'start'],
  ['center', 'center'],
  ['end', 'end'],
  ['flex-end', 'end'],
  ['space-between', 'space-between'],
  ['space_between', 'space-between'],
  ['between', 'space-between'],
  ['space-around', 'space-around'],
  ['space_around', 'space-around']
])

const CROSS_ALIGNS = new Map<string, CrossAlign>([
  ['start', 'start'],
  ['flex-start', 'start'],
  ['center', 'center'],
  ['end', 'end'],
  ['flex-end', 'end'],
  ['stretch', 'stretch'],
  ['baseline', 'baseline']
])

const HUG_NAMES = ['fit_content', 'hug_content']
const FILL_NAMES = ['fill_container']

export function layoutMode(node: GraphNode): LayoutMode {
  const raw = node.fields.layout
  if (typeof raw !== 'string') return node.type === 'frame' ? 'row' : 'none'
  return LAYOUT_MODES.get(raw.trim().toLowerCase()) ?? 'none'
}

export function mainAlign(node: GraphNode): MainAlign {
  const raw = node.fields.justifyContent
  if (typeof raw !== 'string') return 'start'
  return MAIN_ALIGNS.get(raw.trim().toLowerCase()) ?? 'start'
}

export function crossAlign(node: GraphNode): CrossAlign {
  const raw = node.fields.alignItems
  if (typeof raw !== 'string') return 'start'
  return CROSS_ALIGNS.get(raw.trim().toLowerCase()) ?? 'start'
}

export function gapOf(node: GraphNode): number {
  return finiteNumber(node.fields.gap) ?? 0
}

export function clipsContent(node: GraphNode): boolean {
  const value = node.fields.clip
  return value === true || value === 'true'
}

export function isAbsolute(node: GraphNode): boolean {
  const raw = node.fields.layoutPosition
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'absolute'
}

export function isVisible(node: GraphNode): boolean {
  const value = node.fields.enabled
  return value !== false && value !== 'false'
}

export function columnCount(node: GraphNode): number {
  return positiveInt(node.fields.columns) ?? 1
}

export function rowCount(node: GraphNode): number | undefined {
  return positiveInt(node.fields.rows)
}

export function sizeSpec(value: JSONValue, flow: boolean): SizeSpec {
  if (typeof value === 'number' && Number.isFinite(value)) return { mode: 'fixed', value }
  if (typeof value === 'string') return sizeString(value.trim(), flow)
  return missingSize(flow)
}

export function paddingOf(value: JSONValue): Edges {
  if (typeof value === 'number' && Number.isFinite(value)) return edges(value, value, value, value)
  const list = numberList(value)
  if (!list) return edges(0, 0, 0, 0)
  return edges(...quad(list))
}

export function finiteNumber(value: JSONValue): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

export function positiveInt(value: JSONValue): number | undefined {
  const number = finiteNumber(value)
  if (number === undefined || number < 1) return undefined
  return Math.floor(number)
}

/** Geometry already stored on a node layout did not recompute. */
export function storedBox(node: GraphNode): LayoutBox | undefined {
  const width = fixedSize(node.fields.width)
  const height = fixedSize(node.fields.height)
  if (width === undefined || height === undefined) return undefined
  return {
    id: node.id,
    x: finiteNumber(node.fields.x) ?? 0,
    y: finiteNumber(node.fields.y) ?? 0,
    width,
    height
  }
}

function fixedSize(value: JSONValue): number | undefined {
  const spec = sizeSpec(value, false)
  return spec.mode === 'fixed' ? spec.value : undefined
}

function missingSize(flow: boolean): SizeSpec {
  return flow ? { mode: 'hug', value: undefined } : { mode: 'fixed', value: undefined }
}

function sizeString(value: string, flow: boolean): SizeSpec {
  const named = namedSize(value)
  if (named) return named
  if (value !== '' && Number.isFinite(Number(value))) return { mode: 'fixed', value: Number(value) }
  return missingSize(flow)
}

function namedSize(value: string): SizeSpec | undefined {
  const hug = parameterized(value, HUG_NAMES)
  if (hug) return { mode: 'hug', value: hug.value }
  const fill = parameterized(value, FILL_NAMES)
  if (fill) return { mode: 'fill', value: fill.value }
  return undefined
}

function parameterized(
  value: string,
  names: readonly string[]
): { value: number | undefined } | undefined {
  for (const name of names) {
    if (value === name) return { value: undefined }
    const prefix = `${name}(`
    if (!value.startsWith(prefix) || !value.endsWith(')')) continue
    const raw = value.slice(prefix.length, -1).trim()
    if (raw === '') return { value: undefined }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return undefined
    return { value: parsed }
  }
  return undefined
}

function numberList(value: JSONValue): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const numbers: number[] = []
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return undefined
    numbers.push(item)
  }
  return numbers
}

function quad(list: readonly number[]): [number, number, number, number] {
  if (list.length >= 4) return [list[0], list[1], list[2], list[3]]
  if (list.length === 2) return [list[0], list[1], list[0], list[1]]
  if (list.length === 1) return [list[0], list[0], list[0], list[0]]
  return [0, 0, 0, 0]
}

function edges(top: number, right: number, bottom: number, left: number): Edges {
  return { top, right, bottom, left }
}

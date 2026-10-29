import * as v from 'valibot'
import * as Y from 'yjs'

import type { JSONValue } from '@open-pencil/session'
import { jsonValueSchema } from '@open-pencil/session/schema'

import { isValueRecord, sameValue } from './json'
import type { SharedNode } from './tree'

/**
 * A node's Y.Map is last-write per field. `valuesByMode` is its own map and merges per entry.
 * Text `content` is one string field. It is not a character CRDT.
 */

export const TYPE_FIELD = 'type'
export const PARENTS_FIELD = 'parents'
export const ORDER_KEY_FIELD = 'orderKey'
export const CLOCK_FIELD = 'clock'

/** Fields stored as their own map. Variable values per mode are the one the engine shares. */
const MAP_FIELDS = new Set(['valuesByMode'])

const RESERVED = new Set([TYPE_FIELD, PARENTS_FIELD, ORDER_KEY_FIELD])

export function readSharedNodes(nodes: Y.Map<unknown>): SharedNode[] {
  const list: SharedNode[] = []
  for (const [id, value] of nodes) {
    if (!(value instanceof Y.Map)) continue
    list.push({ id, parents: readParents(value), orderKey: readOrderKey(value) })
  }
  return list
}

export function readType(ynode: Y.Map<unknown>): string {
  const value = ynode.get(TYPE_FIELD)
  if (typeof value === 'string' && value.length > 0) return value
  return 'rectangle'
}

export function readFields(ynode: Y.Map<unknown>): Record<string, JSONValue> {
  const fields: Record<string, JSONValue> = {}
  for (const [key, value] of ynode) {
    if (RESERVED.has(key)) continue
    const json = readValue(value)
    if (json !== undefined) fields[key] = structuredClone(json)
  }
  return fields
}

export function readOrderKey(ynode: Y.Map<unknown>): string {
  const value = ynode.get(ORDER_KEY_FIELD)
  return typeof value === 'string' ? value : ''
}

export function readParents(ynode: Y.Map<unknown>): Map<string, number> {
  const parents = ynode.get(PARENTS_FIELD)
  const entries = new Map<string, number>()
  if (!(parents instanceof Y.Map)) return entries
  for (const [parentId, value] of parents) {
    const counter = readCounter(value)
    if (counter !== undefined) entries.set(parentId, counter)
  }
  return entries
}

export function ensureNode(nodes: Y.Map<unknown>, id: string): Y.Map<unknown> {
  const existing = nodes.get(id)
  if (existing instanceof Y.Map) return existing
  const created = new Y.Map<unknown>()
  nodes.set(id, created)
  return created
}

export function writeParentEntry(ynode: Y.Map<unknown>, parentId: string, counter: number): void {
  const parents = parentMap(ynode)
  if (parents.get(parentId) !== counter) parents.set(parentId, counter)
}

export function writeFields(ynode: Y.Map<unknown>, fields: Record<string, JSONValue>): void {
  for (const [key, value] of Object.entries(fields)) {
    if (RESERVED.has(key)) continue
    if (MAP_FIELDS.has(key) && isValueRecord(value)) {
      writeMapEntries(ynode, key, value)
      continue
    }
    if (sameValue(readValue(ynode.get(key)), value)) continue
    ynode.set(key, structuredClone(value))
  }
}

/** One more than every counter this document has seen, then stored on `meta.clock`. */
export function bumpClock(meta: Y.Map<unknown>, nodes: Y.Map<unknown>): number {
  const next = highestClock(meta, nodes) + 1
  meta.set(CLOCK_FIELD, next)
  return next
}

export function changedFields(
  current: Record<string, JSONValue>,
  next: Record<string, JSONValue>
): Record<string, JSONValue> | undefined {
  const patch: Record<string, JSONValue> = {}
  let changed = false
  for (const [key, value] of Object.entries(next)) {
    if (sameValue(current[key], value)) continue
    patch[key] = value
    changed = true
  }
  return changed ? patch : undefined
}

/** Map fields keep entries the other peer wrote; the store sees the merged object. */
export function fieldsForStore(
  current: Record<string, JSONValue>,
  fields: Record<string, JSONValue>
): Record<string, JSONValue> {
  const next: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!MAP_FIELDS.has(key) || !isValueRecord(value)) {
      next[key] = value
      continue
    }
    const previous = current[key]
    next[key] = mergeRecords(isValueRecord(previous) ? previous : {}, value)
  }
  return next
}

function writeMapEntries(
  ynode: Y.Map<unknown>,
  field: string,
  entries: Record<string, JSONValue>
): void {
  const map = mapField(ynode, field)
  for (const [key, value] of Object.entries(entries)) {
    if (sameValue(readValue(map.get(key)), value)) continue
    map.set(key, structuredClone(value))
  }
}

function mapField(ynode: Y.Map<unknown>, field: string): Y.Map<unknown> {
  const existing = ynode.get(field)
  if (existing instanceof Y.Map) return existing
  const created = new Y.Map<unknown>()
  ynode.set(field, created)
  return created
}

function parentMap(ynode: Y.Map<unknown>): Y.Map<unknown> {
  const existing = ynode.get(PARENTS_FIELD)
  if (existing instanceof Y.Map) return existing
  const created = new Y.Map<unknown>()
  ynode.set(PARENTS_FIELD, created)
  return created
}

function mergeRecords(
  base: Record<string, JSONValue>,
  extra: Record<string, JSONValue>
): Record<string, JSONValue> {
  const next: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(base)) next[key] = value
  for (const [key, value] of Object.entries(extra)) next[key] = value
  return next
}

function highestClock(meta: Y.Map<unknown>, nodes: Y.Map<unknown>): number {
  let highest = readCounter(meta.get(CLOCK_FIELD)) ?? 0
  for (const value of nodes.values()) {
    if (!(value instanceof Y.Map)) continue
    for (const counter of readParents(value).values()) {
      if (counter > highest) highest = counter
    }
  }
  return highest
}

function readCounter(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  return undefined
}

function readValue(value: unknown): JSONValue | undefined {
  const plain = value instanceof Y.Map ? value.toJSON() : value
  const parsed = v.safeParse(jsonValueSchema, plain)
  return parsed.success ? parsed.output : undefined
}

import type { JSONValue } from '@open-pencil/session'

import { parseHexColor, colorToHex } from './color'
import { isRef, jsonList, jsonRecord } from './json'
import type { LintVariables, VariableKind } from './types'

export function describeVariables(
  bag: Readonly<Record<string, JSONValue>> | undefined
): LintVariables {
  const source = bag ?? {}
  const counts = { color: 0, number: 0, string: 0, boolean: 0 }
  const colorsByHex = new Map<string, { name: string }>()
  for (const [name, entry] of Object.entries(source)) {
    const kind = kindOf(entry, source)
    counts[kind] += 1
    if (kind !== 'color') continue
    const resolved = resolveName(name, source, new Set())
    if (typeof resolved !== 'string') continue
    const color = parseHexColor(resolved)
    if (!color || color.a < 1) continue
    const hex = colorToHex(color)
    if (!colorsByHex.has(hex)) colorsByHex.set(hex, { name })
  }
  return {
    counts,
    colorsByHex,
    resolve(name: string) {
      return resolveName(name, source, new Set())
    }
  }
}

export function resolveValue(
  value: JSONValue | undefined,
  variables: LintVariables
): JSONValue | undefined {
  if (typeof value === 'string' && isRef(value)) return variables.resolve(value.slice(1))
  return value
}

function kindOf(entry: JSONValue, bag: Readonly<Record<string, JSONValue>>): VariableKind {
  const body = jsonRecord(entry)
  if (body && typeof body.type === 'string') return kindFromName(body.type)
  return inferKind(unwrap(entry, bag, new Set()))
}

function kindFromName(type: string): VariableKind {
  if (type === 'color') return 'color'
  if (type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  return 'string'
}

function inferKind(value: JSONValue | undefined): VariableKind {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string' && parseHexColor(value)) return 'color'
  return 'string'
}

function resolveName(
  name: string,
  bag: Readonly<Record<string, JSONValue>>,
  seen: Set<string>
): JSONValue | undefined {
  if (seen.has(name) || !Object.hasOwn(bag, name)) return undefined
  seen.add(name)
  return unwrap(bag[name], bag, seen)
}

function unwrap(
  entry: JSONValue,
  bag: Readonly<Record<string, JSONValue>>,
  seen: Set<string>
): JSONValue | undefined {
  const raw = rawValue(entry)
  if (typeof raw !== 'string' || !isRef(raw)) return raw
  return resolveName(raw.slice(1), bag, seen)
}

function rawValue(entry: JSONValue): JSONValue | undefined {
  const body = jsonRecord(entry)
  if (!body || !Object.hasOwn(body, 'value')) return undefined
  const listed = jsonList(body.value)
  if (!listed) return body.value
  for (const item of listed) {
    const row = jsonRecord(item)
    if (row && Object.hasOwn(row, 'value')) return row.value
  }
  return undefined
}

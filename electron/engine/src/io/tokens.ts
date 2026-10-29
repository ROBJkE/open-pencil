import * as v from 'valibot'

import type { Command, JSONValue } from '@open-pencil/session'

import { designTokenFileSchema, type DesignTokenFile } from './schema'
import { isRecord } from './values'

/** OpenPencil fields kept beside a DTCG token, the same extension key the app writes. */
const OPENPENCIL_EXTENSION = 'dev.openpencil'

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/**
 * The document variable bag as one DTCG object.
 * A bag entry `{ value, theme? }` becomes `$type`, `$value`, and an optional theme extension.
 */
export function exportDesignTokens(
  variables: Readonly<Record<string, JSONValue>>
): DesignTokenFile {
  const file: Record<string, JSONValue> = {}
  for (const [name, entry] of Object.entries(variables)) {
    const token = tokenFrom(entry)
    if (token) file[name] = token
  }
  const text = JSON.stringify(file)
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), designTokenFileSchema), text)
  if (!parsed.success) {
    throw new Error(`Design tokens could not be written: ${v.summarize(parsed.issues)}`)
  }
  return parsed.output
}

/** Parses a DTCG JSON document into `set-variable` commands, one per token. */
export function importDesignTokens(text: string): Command[] {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), designTokenFileSchema), text)
  if (!parsed.success) {
    throw new Error(`Design tokens are not a DTCG document: ${v.summarize(parsed.issues)}`)
  }
  const commands: Command[] = []
  collect(parsed.output, [], commands)
  return commands
}

function tokenFrom(entry: JSONValue): JSONValue | undefined {
  if (!isRecord(entry)) return tokenObject(inferredType(entry), entry, undefined)
  if (!Object.hasOwn(entry, 'value')) return undefined
  const type = typeof entry.type === 'string' ? entry.type : inferredType(entry.value)
  return tokenObject(type, entry.value, themeOf(entry.theme))
}

function tokenObject(
  type: string,
  value: JSONValue,
  theme: Record<string, string> | undefined
): JSONValue {
  const token: Record<string, JSONValue> = { $type: type, $value: value }
  if (theme) token.$extensions = { [OPENPENCIL_EXTENSION]: { theme } }
  return token
}

function inferredType(value: JSONValue): string {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string' && HEX.test(value)) return 'color'
  return 'string'
}

function themeOf(value: JSONValue | undefined): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const theme: Record<string, string> = {}
  for (const [axis, axisValue] of Object.entries(value)) {
    if (typeof axisValue !== 'string') return undefined
    theme[axis] = axisValue
  }
  if (Object.keys(theme).length === 0) return undefined
  return theme
}

function collect(value: JSONValue, path: readonly string[], commands: Command[]): void {
  if (!isRecord(value)) return
  if (Object.hasOwn(value, '$value')) {
    const name = path.join('.')
    if (name.length === 0) return
    commands.push(setVariable(name, value.$value, themeFrom(value.$extensions)))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$')) continue
    collect(child, [...path, key], commands)
  }
}

function themeFrom(value: JSONValue | undefined): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const owned = value[OPENPENCIL_EXTENSION]
  if (!isRecord(owned)) return undefined
  return themeOf(owned.theme)
}

function setVariable(
  name: string,
  value: JSONValue,
  theme: Record<string, string> | undefined
): Command {
  if (theme) return { type: 'set-variable', name, value, theme }
  return { type: 'set-variable', name, value }
}

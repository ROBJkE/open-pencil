import type { JSONValue } from '@open-pencil/session'

export function jsonRecord(value: JSONValue | undefined): Record<string, JSONValue> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value
}

export function jsonList(value: JSONValue | undefined): readonly JSONValue[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
}

export function isRef(value: string): boolean {
  return value.startsWith('$') && value.length > 1
}

export function finite(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '' || isRef(value)) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

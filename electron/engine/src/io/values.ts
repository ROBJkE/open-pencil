import type { JSONValue } from '@open-pencil/session'

export function isRecord(value: JSONValue | undefined): value is Record<string, JSONValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function finiteNumber(value: JSONValue | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

/** Decimal form that keeps integer coordinates exact and prints `-0` as `0`. */
export function formatCoordinate(value: number): string {
  if (Object.is(value, -0)) return '0'
  return String(value)
}

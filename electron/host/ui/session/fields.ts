import type { JSONValue } from '@open-pencil/session'

export function readNumber(value: JSONValue | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function readText(value: JSONValue | null | undefined): string {
  return typeof value === 'string' ? value : ''
}

export function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

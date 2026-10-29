import type { JSONValue } from '@open-pencil/session'

export function isValueRecord(value: JSONValue | undefined): value is Record<string, JSONValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural equality, so key order in a merged map does not count as a change. */
export function sameValue(left: JSONValue | undefined, right: JSONValue | undefined): boolean {
  if (left === right) return true
  if (typeof left !== typeof right) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => sameValue(item, right[index]))
  }
  if (!isValueRecord(left) || !isValueRecord(right)) return false
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every((key) => sameValue(left[key], right[key]))
}

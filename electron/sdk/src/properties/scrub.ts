import type { JSONValue } from '@open-pencil/session'

import type { PropertyField } from './fields'

export interface NumberScrub {
  key: string
  startX: number
  startValue: number
  previewed: boolean
}

export function beginScrub(field: PropertyField, clientX: number): NumberScrub | null {
  if (field.kind !== 'number' || field.numeric === null) return null
  return { key: field.key, startX: clientX, startValue: field.numeric, previewed: false }
}

export function scrubbedNumber(scrub: NumberScrub, clientX: number): number {
  return scrub.startValue + (clientX - scrub.startX)
}

export function previewEdits(
  ids: readonly string[],
  key: string,
  value: JSONValue
): { id: string; fields: Record<string, JSONValue> }[] {
  return ids.map(function edit(id) {
    return { id, fields: { [key]: value } }
  })
}

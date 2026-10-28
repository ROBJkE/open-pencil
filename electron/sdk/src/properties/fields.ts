import type { JSONValue, SelectionProperties } from '@open-pencil/session'

export type PropertyKind = 'number' | 'boolean' | 'text' | 'mixed' | 'complex'

export interface PropertyField {
  key: string
  kind: PropertyKind
  text: string
  checked: boolean
  numeric: number | null
}

function fieldFrom(key: string, value: JSONValue | null, mixed: boolean): PropertyField {
  if (mixed) return { key, kind: 'mixed', text: '', checked: false, numeric: null }
  if (typeof value === 'number') {
    return { key, kind: 'number', text: String(value), checked: false, numeric: value }
  }
  if (typeof value === 'boolean') {
    return { key, kind: 'boolean', text: '', checked: value, numeric: null }
  }
  if (typeof value === 'string' || value === null) {
    return { key, kind: 'text', text: value ?? '', checked: false, numeric: null }
  }
  return { key, kind: 'complex', text: JSON.stringify(value), checked: false, numeric: null }
}

export function propertyFields(selection: SelectionProperties): PropertyField[] {
  const mixed = new Set(selection.mixed)
  return Object.entries(selection.fields).map(function mapField([key, value]) {
    return fieldFrom(key, value, mixed.has(key))
  })
}

export function editedValue(field: PropertyField, text: string): JSONValue | null {
  if (field.kind === 'number') {
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (field.kind === 'text' || field.kind === 'mixed') return text
  return null
}

export function eventInputValue(event: Event): string | null {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return null
  return target.value
}

export function eventChecked(event: Event): boolean | null {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return null
  return target.checked
}

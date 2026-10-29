import type { Command } from '@open-pencil/session'

export function scrubValue(start: number, deltaX: number, min?: number, max?: number): number {
  let next = Math.round(start + deltaX)
  if (min !== undefined) next = Math.max(min, next)
  if (max !== undefined) next = Math.min(max, next)
  return next
}

export function previewCommand(
  ids: readonly string[],
  field: string,
  value: number
): Command {
  return {
    type: 'preview',
    edits: ids.map((id) => ({ id, fields: { [field]: value } }))
  }
}

export function commitPreviewCommand(): Command {
  return { type: 'commit-preview' }
}

export function cancelPreviewCommand(): Command {
  return { type: 'cancel-preview' }
}

export function editCommand(id: string, field: string, value: number): Command {
  return { type: 'edit', id, fields: { [field]: value }, coalesceKey: field }
}

/** One preview per sampled value, then a single commit. */
export function scrubSequence(
  ids: readonly string[],
  field: string,
  values: readonly number[]
): Command[] {
  return [
    ...values.map((value) => previewCommand(ids, field, value)),
    commitPreviewCommand()
  ]
}

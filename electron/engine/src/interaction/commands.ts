import type { Command, JSONValue } from '@open-pencil/session'

import type { Viewport } from './types'

export interface PreviewEdit {
  readonly id: string
  readonly fields: Record<string, JSONValue>
}

export function previewCommand(edits: readonly PreviewEdit[]): Command {
  return {
    type: 'preview',
    edits: edits.map((edit) => ({ id: edit.id, fields: { ...edit.fields } }))
  }
}

export function commitPreviewCommand(): Command {
  return { type: 'commit-preview' }
}

export function cancelPreviewCommand(): Command {
  return { type: 'cancel-preview' }
}

export function createCommand(
  target: { readonly id: string; readonly parentId: string | null; readonly index: number },
  type: string,
  fields: Record<string, JSONValue>
): Command {
  return {
    type: 'create',
    parentId: target.parentId,
    index: target.index,
    node: { id: target.id, type, fields: { ...fields } }
  }
}

export function selectionCommand(ids: readonly string[]): Command {
  return { type: 'set-selection', ids: [...ids] }
}

export function viewportCommand(viewport: Viewport): Command {
  return {
    type: 'set-viewport',
    zoom: viewport.zoom,
    panX: viewport.panX,
    panY: viewport.panY,
    width: viewport.width,
    height: viewport.height
  }
}

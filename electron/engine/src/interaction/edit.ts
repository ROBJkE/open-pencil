import type { Command } from '@open-pencil/session'

import {
  cancelPreviewCommand,
  commitPreviewCommand,
  previewCommand,
  selectionCommand,
  type PreviewEdit
} from './commands'
import type {
  ClickGesture,
  Gesture,
  MarqueeGesture,
  MoveGesture,
  ResizeGesture,
  RotateGesture
} from './types'

/** Selection, move, resize, and rotate. Move and resize share one preview, then one commit. */
export function editCommands(gesture: Gesture): Command[] {
  switch (gesture.kind) {
    case 'click':
      return [selectionCommand(clickedIds(gesture))]
    case 'marquee':
      return marquee(gesture)
    case 'move':
      return previewPhase(gesture.phase, moveEdits(gesture))
    case 'resize':
      return previewPhase(gesture.phase, resizeEdits(gesture))
    case 'rotate':
      return previewPhase(gesture.phase, rotateEdits(gesture))
    default:
      return []
  }
}

function clickedIds(gesture: ClickGesture): string[] {
  if (!gesture.additive) return gesture.hitId ? [gesture.hitId] : []
  if (!gesture.hitId) return [...gesture.selection]
  if (gesture.selection.includes(gesture.hitId)) {
    return gesture.selection.filter((id) => id !== gesture.hitId)
  }
  return [...gesture.selection, gesture.hitId]
}

function marquee(gesture: MarqueeGesture): Command[] {
  if (gesture.phase !== 'commit') return []
  if (!gesture.additive) return [selectionCommand(gesture.hits)]
  return [selectionCommand(union(gesture.selection, gesture.hits))]
}

function union(selection: readonly string[], hits: readonly string[]): string[] {
  const seen = new Set(selection)
  const ids = [...selection]
  for (const id of hits) {
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function moveEdits(gesture: MoveGesture): readonly PreviewEdit[] | null {
  if (!Number.isFinite(gesture.dx) || !Number.isFinite(gesture.dy)) return null
  const edits: PreviewEdit[] = []
  for (const origin of gesture.origins) {
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null
    edits.push({ id: origin.id, fields: { x: origin.x + gesture.dx, y: origin.y + gesture.dy } })
  }
  return edits
}

function resizeEdits(gesture: ResizeGesture): readonly PreviewEdit[] | null {
  const { x, y, width, height } = gesture
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null
  }
  return [{ id: gesture.id, fields: { x, y, width, height } }]
}

function rotateEdits(gesture: RotateGesture): readonly PreviewEdit[] | null {
  if (!Number.isFinite(gesture.rotation)) return null
  return [{ id: gesture.id, fields: { rotation: gesture.rotation } }]
}

/**
 * A preview drag returns one preview command. Commit returns commit-preview, one undo step
 * when the caller applies it. Cancel drops the preview. The geometry is not repeated on commit.
 */
function previewPhase(
  phase: 'preview' | 'commit' | 'cancel',
  edits: readonly PreviewEdit[] | null
): Command[] {
  if (phase === 'cancel') return [cancelPreviewCommand()]
  if (phase === 'commit') return [commitPreviewCommand()]
  if (!edits || edits.length === 0) return []
  return [previewCommand(edits)]
}

import type { CanvasTool, Command } from '@open-pencil/session'

import { drawCommands } from './draw'
import { editCommands } from './edit'
import { panCommands, zoomCommands, zoomRectCommands } from './navigate'
import type { Gesture } from './types'

/**
 * Commands for one gesture of `tool`.
 *
 * Hover returns nothing: the id is `hitTest` on the local spatial index, not a round trip.
 * Finishing a draw creates one node. The caller undoes that single create.
 * A preview drag returns a preview command; committing it returns commit-preview, one undo step.
 * Pass `hand` or `zoom` for a transient tool. The active tool is not read from anywhere.
 */
export function toolCommands(tool: CanvasTool, gesture: Gesture): Command[] {
  if (gesture.kind === 'hover') return []
  if (gesture.kind === 'pan') return panCommands(tool, gesture)
  if (gesture.kind === 'zoom') return zoomCommands(tool, gesture)
  if (gesture.kind === 'draw' && tool === 'zoom') return zoomRectCommands(gesture)
  if (gesture.kind === 'draw' || gesture.kind === 'pen') return drawCommands(tool, gesture)
  if (tool === 'select' || tool === 'vector') return editCommands(gesture)
  return []
}

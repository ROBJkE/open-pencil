import type { GraphNode } from '@open-pencil/session'

import { textContent, textFontSize } from './fields'
import type { TextSize } from './types'

/** Half an em per character. One stored line, including a trailing empty line, counts. */
const FALLBACK_WIDTH_FACTOR = 0.5

/**
 * Size used when CanvasKit paragraph cannot measure the node.
 * Width is `fontSize * content.length * 0.5`. Height is `fontSize * line count`.
 */
export function fallbackTextSize(node: GraphNode): TextSize {
  const fontSize = textFontSize(node)
  const content = textContent(node)
  return {
    width: fontSize * content.length * FALLBACK_WIDTH_FACTOR,
    height: fontSize * content.split('\n').length
  }
}

import type { FontFace, GraphNode } from '@open-pencil/session'

import { fallbackTextSize } from './fallback'
import { shapeText } from './paragraph'
import type { TextMeasurement } from './types'

/**
 * Width and height of `node`.
 * CanvasKit paragraph measures `font` when its file loads under bun.
 * Otherwise the size is the deterministic fallback.
 */
export async function measureText(node: GraphNode, font: FontFace): Promise<TextMeasurement> {
  const shaped = await shapeText(node, font)
  if (shaped) return { width: shaped.width, height: shaped.height, path: 'paragraph' }
  const fallback = fallbackTextSize(node)
  return { width: fallback.width, height: fallback.height, path: 'fallback' }
}

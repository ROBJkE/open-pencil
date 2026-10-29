import type { FontFace, GraphNode } from '@open-pencil/session'

import type { DocumentStore } from '../graph/store'
import { textFamily, textWeight } from './fields'
import { measureText } from './measure'
import type { TextEditOptions, TextEditResult, TextMeasure, TextMeasurement } from './types'

/**
 * Commits `content` through the document edit command, as one undo step.
 * Measures `id` only. Sibling text is not shaped.
 */
export async function applyTextEdit(
  store: DocumentStore,
  id: string,
  content: string,
  options: TextEditOptions = {}
): Promise<TextEditResult> {
  const current = store.getNode(id)
  if (!current) return rejectedEdit()
  const draft = replaceContent(current, content)
  const measuredIds: string[] = []
  const measurement = await measureOne(
    options.measure ?? measureText,
    draft,
    options.font ?? fontFromNode(draft),
    measuredIds
  )
  const applied = store.apply({ type: 'edit', id, fields: { content } })
  if (!applied.ack.accepted) return rejectedEdit()
  return {
    accepted: true,
    width: measurement.width,
    height: measurement.height,
    path: measurement.path,
    measuredIds
  }
}

function measureOne(
  measure: TextMeasure,
  node: GraphNode,
  font: FontFace,
  measuredIds: string[]
): Promise<TextMeasurement> {
  measuredIds.push(node.id)
  return measure(node, font)
}

function replaceContent(node: GraphNode, content: string): GraphNode {
  return { ...node, fields: { ...node.fields, content } }
}

function fontFromNode(node: GraphNode): FontFace {
  const style = node.fields.fontStyle
  return {
    family: textFamily(node),
    style: typeof style === 'string' && style.length > 0 ? style : 'Regular',
    weight: textWeight(node),
    path: ''
  }
}

function rejectedEdit(): TextEditResult {
  return { accepted: false, width: 0, height: 0, path: 'fallback', measuredIds: [] }
}

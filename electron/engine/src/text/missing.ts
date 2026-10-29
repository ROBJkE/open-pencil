import type { FontCatalog, GraphNode } from '@open-pencil/session'

import { textFamily } from './fields'
import type { MissingFont } from './types'

/** The node's family when no catalog face uses it. A present family returns null. */
export function missingFont(node: GraphNode, catalog: FontCatalog): MissingFont | null {
  const family = textFamily(node)
  const present = catalog.faces.some((face) => face.family.trim() === family)
  if (present) return null
  return { nodeId: node.id, family }
}

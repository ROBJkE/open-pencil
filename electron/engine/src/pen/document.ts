import type { PenDocument, PenNode } from '@open-pencil/pen/schema'
import type { Checkpoint, GraphNode, JSONValue } from '@open-pencil/session'

/** Schema version written into every `.pen` file. Readers still accept older version strings. */
const PEN_DOCUMENT_VERSION = '2.21'

/** `id`, `type`, and `children` are the tree, not stored properties. */
const STRUCTURAL_KEYS = new Set(['id', 'type', 'children'])

/**
 * Properties the `.pen` schema knows, plus `op`, the boolean operation the document engine stores
 * on a boolean node. Anything else is passthrough and is written back as an unknown key.
 */
const NODE_FIELDS = new Set<string>([
  'name',
  'context',
  'x',
  'y',
  'width',
  'height',
  'reusable',
  'theme',
  'enabled',
  'opacity',
  'flipX',
  'flipY',
  'layoutPosition',
  'rotation',
  'fill',
  'stroke',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeAlignment',
  'effect',
  'cornerRadius',
  'layout',
  'gap',
  'layoutIncludeStroke',
  'padding',
  'justifyContent',
  'alignItems',
  'clip',
  'placeholder',
  'slot',
  'innerRadius',
  'startAngle',
  'sweepAngle',
  'polygonCount',
  'geometry',
  'fillRule',
  'viewBox',
  'content',
  'textGrowth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textAlignVertical',
  'underline',
  'strikethrough',
  'href',
  'library',
  'icon',
  'weight',
  'iconFontName',
  'iconFontFamily',
  'ref',
  'descendants',
  'op'
])

export function penDocumentFromCheckpoint(checkpoint: Checkpoint): Record<string, unknown> {
  const document: Record<string, unknown> = { version: PEN_DOCUMENT_VERSION }
  const imports = importsFrom(checkpoint.libraries)
  if (imports) document.imports = imports
  const variables = variablesFrom(checkpoint.variables)
  if (variables) document.variables = variables
  assignBag(document, 'comments', checkpoint.comments)
  assignBag(document, 'shaders', checkpoint.shaders)
  assignBag(document, 'lintDismissals', checkpoint.lintDismissals)
  document.children = penChildren(checkpoint)
  return document
}

/** A checkpoint with empty session state. Selection, history, and viewport are not stored. */
export function checkpointFromPen(doc: PenDocument): Checkpoint {
  const nodes: GraphNode[] = []
  const rootIds = flatten(doc.children, null, nodes, new Set())
  const checkpoint: Checkpoint = {
    version: 1,
    nodes,
    rootIds,
    selection: [],
    hoverId: null,
    tool: 'select',
    viewport: {
      pageId: rootIds[0] ?? null,
      zoom: 1,
      panX: 0,
      panY: 0,
      width: 0,
      height: 0
    },
    expanded: [],
    entries: [],
    undone: 0
  }
  const variables = jsonRecord(doc.variables)
  if (variables) checkpoint.variables = variables
  const comments = jsonRecord(doc.comments)
  if (comments) checkpoint.comments = comments
  const lintDismissals = jsonRecord(doc.lintDismissals)
  if (lintDismissals) checkpoint.lintDismissals = lintDismissals
  const shaders = jsonRecord(doc.shaders)
  if (shaders) checkpoint.shaders = shaders
  const libraries = jsonRecord(doc.imports)
  if (libraries) checkpoint.libraries = libraries
  return checkpoint
}

function penChildren(checkpoint: Checkpoint): Record<string, unknown>[] {
  const byId = new Map(checkpoint.nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  const listed = checkpoint.rootIds.filter((id) => byId.has(id))
  const listedIds = new Set(listed)
  const parentless = checkpoint.nodes
    .filter((node) => node.parentId === null && !listedIds.has(node.id))
    .map((node) => node.id)
  return [...listed, ...parentless].flatMap((id) => {
    const node = byId.get(id)
    if (!node) return []
    const pen = toPen(node, byId, seen)
    return pen ? [pen] : []
  })
}

function toPen(
  node: GraphNode,
  byId: ReadonlyMap<string, GraphNode>,
  seen: Set<string>
): Record<string, unknown> | undefined {
  if (seen.has(node.id)) return undefined
  seen.add(node.id)
  const body: Record<string, unknown> = { id: node.id, type: node.type }
  copyEntries(body, node.fields)
  copyEntries(body, node.passthrough)
  const children = node.childIds.flatMap((id) => {
    const child = byId.get(id)
    if (!child) return []
    const pen = toPen(child, byId, seen)
    return pen ? [pen] : []
  })
  if (children.length > 0) body.children = children
  return body
}

function flatten(
  pens: readonly PenNode[],
  parentId: string | null,
  into: GraphNode[],
  seen: Set<string>
): string[] {
  const ids: string[] = []
  for (const pen of pens) {
    if (seen.has(pen.id)) continue
    seen.add(pen.id)
    const { fields, passthrough } = split(pen)
    const node: GraphNode = {
      id: pen.id,
      type: pen.type,
      parentId,
      childIds: [],
      fields,
      passthrough
    }
    into.push(node)
    node.childIds = pen.children ? flatten(pen.children, pen.id, into, seen) : []
    ids.push(pen.id)
  }
  return ids
}

function split(pen: PenNode): {
  fields: Record<string, JSONValue>
  passthrough: Record<string, JSONValue>
} {
  const fields: Record<string, JSONValue> = {}
  const passthrough: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(pen)) {
    if (STRUCTURAL_KEYS.has(key)) continue
    const json = jsonValue(value)
    if (json === undefined) continue
    if (NODE_FIELDS.has(key)) fields[key] = json
    else passthrough[key] = json
  }
  return { fields, passthrough }
}

function copyEntries(target: Record<string, unknown>, source: Record<string, JSONValue>): void {
  for (const [key, value] of Object.entries(source)) {
    if (STRUCTURAL_KEYS.has(key)) continue
    target[key] = value
  }
}

function assignBag(
  document: Record<string, unknown>,
  key: string,
  value: Record<string, JSONValue> | undefined
): void {
  if (!value || Object.keys(value).length === 0) return
  document[key] = value
}

/**
 * The checkpoint stores a pen variable (`type` and `value`) or the engine bag `{ value, theme? }`.
 * The file always gets the pen shape.
 */
function variablesFrom(
  bag: Record<string, JSONValue> | undefined
): Record<string, JSONValue> | undefined {
  if (!bag || Object.keys(bag).length === 0) return undefined
  const variables: Record<string, JSONValue> = {}
  for (const [name, value] of Object.entries(bag)) {
    const variable = penVariable(value)
    if (variable) variables[name] = variable
  }
  return Object.keys(variables).length > 0 ? variables : undefined
}

function penVariable(value: JSONValue): JSONValue | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.type === 'string' && Object.hasOwn(value, 'value')) return value
  if (!Object.hasOwn(value, 'value')) return value
  const raw = value.value
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return value
  const rest: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'value' || key === 'theme') continue
    rest[key] = item
  }
  if (!Object.hasOwn(value, 'theme')) return { ...rest, type: scalarType(raw), value: raw }
  const theme = value.theme
  if (!isRecord(theme)) return value
  const axes: Record<string, string> = {}
  for (const [axis, axisValue] of Object.entries(theme)) {
    if (typeof axisValue !== 'string') return value
    axes[axis] = axisValue
  }
  return { ...rest, type: scalarType(raw), value: [{ value: raw, theme: axes }] }
}

function scalarType(value: string | number | boolean): string {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

function isRecord(value: JSONValue): value is Record<string, JSONValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function importsFrom(
  libraries: Record<string, JSONValue> | undefined
): Record<string, string> | undefined {
  if (!libraries) return undefined
  const imports: Record<string, string> = {}
  for (const [name, value] of Object.entries(libraries)) {
    if (typeof value === 'string') imports[name] = value
  }
  return Object.keys(imports).length > 0 ? imports : undefined
}

function jsonRecord(value: unknown): Record<string, JSONValue> | undefined {
  const converted = jsonValue(value)
  if (!converted || typeof converted !== 'object' || Array.isArray(converted)) return undefined
  return Object.keys(converted).length > 0 ? converted : undefined
}

function jsonValue(value: unknown): JSONValue | undefined {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const items: JSONValue[] = []
    for (const item of value) {
      const next = jsonValue(item)
      if (next === undefined) return undefined
      items.push(next)
    }
    return items
  }
  if (typeof value === 'object') {
    const record: Record<string, JSONValue> = {}
    for (const [key, item] of Object.entries(value)) {
      const next = jsonValue(item)
      if (next !== undefined) record[key] = next
    }
    return record
  }
  return undefined
}

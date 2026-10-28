import * as v from 'valibot'

/**
 * Wire format for the Electron editor. Domain code imports these types from
 * `@open-pencil/session`. Schemas stay in this module.
 */

export const jsonValueSchema: v.GenericSchema<unknown, JSONValue> = v.lazy(() =>
  v.union([
    v.string(),
    v.number(),
    v.boolean(),
    v.null(),
    v.array(jsonValueSchema),
    v.record(v.string(), jsonValueSchema)
  ])
)

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue }

export const CANVAS_TOOLS = [
  'select',
  'frame',
  'section',
  'rectangle',
  'ellipse',
  'line',
  'polygon',
  'star',
  'text',
  'pen',
  'vector',
  'hand',
  'zoom'
] as const

export const canvasToolSchema = v.picklist(CANVAS_TOOLS)
export type CanvasTool = v.InferOutput<typeof canvasToolSchema>

export const BOOLEAN_OPS = ['union', 'subtract', 'intersect', 'exclude'] as const
export const booleanOpSchema = v.picklist(BOOLEAN_OPS)
export type BooleanOp = v.InferOutput<typeof booleanOpSchema>

export const JOB_KINDS = ['export', 'vectorize', 'font-subset', 'tokens', 'html-import'] as const
export const jobKindSchema = v.picklist(JOB_KINDS)
export type JobKind = v.InferOutput<typeof jobKindSchema>

export const WORK_PRIORITIES = ['interaction', 'visible-frame', 'background'] as const
export const workPrioritySchema = v.picklist(WORK_PRIORITIES)
export type WorkPriority = v.InferOutput<typeof workPrioritySchema>

const jsonRecordSchema = v.record(v.string(), jsonValueSchema)

export const graphNodeSchema = v.object({
  id: v.string(),
  type: v.string(),
  parentId: v.nullable(v.string()),
  childIds: v.array(v.string()),
  fields: jsonRecordSchema,
  passthrough: jsonRecordSchema
})
export type GraphNode = v.InferOutput<typeof graphNodeSchema>

export const nodeDraftSchema = v.object({
  id: v.optional(v.string()),
  type: v.string(),
  fields: v.optional(jsonRecordSchema),
  passthrough: v.optional(jsonRecordSchema)
})
export type NodeDraft = v.InferOutput<typeof nodeDraftSchema>

const putNodeOperationSchema = v.object({
  kind: v.literal('put-node'),
  node: graphNodeSchema,
  index: v.number()
})
const removeNodeOperationSchema = v.object({
  kind: v.literal('remove-node'),
  id: v.string()
})
const patchFieldsOperationSchema = v.object({
  kind: v.literal('patch-fields'),
  id: v.string(),
  fields: v.record(v.string(), v.nullable(jsonValueSchema))
})
const moveOperationSchema = v.object({
  kind: v.literal('move'),
  id: v.string(),
  parentId: v.nullable(v.string()),
  index: v.number()
})
const patchBagOperationSchema = v.object({
  kind: v.literal('patch-bag'),
  bag: v.picklist(['variables', 'comments', 'lintDismissals', 'shaders', 'libraries']),
  key: v.string(),
  value: v.nullable(jsonValueSchema)
})

export const operationSchema = v.variant('kind', [
  putNodeOperationSchema,
  removeNodeOperationSchema,
  patchFieldsOperationSchema,
  moveOperationSchema,
  patchBagOperationSchema
])
export type Operation = v.InferOutput<typeof operationSchema>

export const logEntrySchema = v.object({
  sequence: v.number(),
  coalesceKey: v.nullable(v.string()),
  forward: v.array(operationSchema),
  inverse: v.array(operationSchema)
})
export type LogEntry = v.InferOutput<typeof logEntrySchema>

export const viewportSchema = v.object({
  pageId: v.nullable(v.string()),
  zoom: v.number(),
  panX: v.number(),
  panY: v.number(),
  width: v.number(),
  height: v.number()
})
export type ViewportSummary = v.InferOutput<typeof viewportSchema>

export const checkpointSchema = v.object({
  version: v.literal(1),
  nodes: v.array(graphNodeSchema),
  rootIds: v.array(v.string()),
  selection: v.array(v.string()),
  hoverId: v.nullable(v.string()),
  tool: canvasToolSchema,
  viewport: viewportSchema,
  expanded: v.array(v.string()),
  entries: v.array(logEntrySchema),
  undone: v.number(),
  variables: v.optional(jsonRecordSchema),
  comments: v.optional(jsonRecordSchema),
  lintDismissals: v.optional(jsonRecordSchema),
  shaders: v.optional(jsonRecordSchema),
  libraries: v.optional(jsonRecordSchema)
})
export type Checkpoint = v.InferOutput<typeof checkpointSchema>

const createCommandSchema = v.object({
  type: v.literal('create'),
  parentId: v.nullable(v.string()),
  index: v.number(),
  node: nodeDraftSchema
})
const editCommandSchema = v.object({
  type: v.literal('edit'),
  id: v.string(),
  fields: jsonRecordSchema,
  coalesceKey: v.optional(v.string())
})
const reparentCommandSchema = v.object({
  type: v.literal('reparent'),
  id: v.string(),
  parentId: v.nullable(v.string()),
  index: v.number()
})
const reorderCommandSchema = v.object({
  type: v.literal('reorder'),
  id: v.string(),
  index: v.number()
})
const deleteCommandSchema = v.object({
  type: v.literal('delete'),
  ids: v.array(v.string())
})
const groupCommandSchema = v.object({
  type: v.literal('group'),
  ids: v.array(v.string())
})
const booleanCommandSchema = v.object({
  type: v.literal('boolean'),
  ids: v.array(v.string()),
  op: booleanOpSchema
})
const setSelectionCommandSchema = v.object({
  type: v.literal('set-selection'),
  ids: v.array(v.string())
})
const setHoverCommandSchema = v.object({
  type: v.literal('set-hover'),
  id: v.nullable(v.string())
})
const setToolCommandSchema = v.object({
  type: v.literal('set-tool'),
  tool: canvasToolSchema
})
const setViewportCommandSchema = v.object({
  type: v.literal('set-viewport'),
  zoom: v.number(),
  panX: v.number(),
  panY: v.number(),
  width: v.number(),
  height: v.number()
})
const setExpandedCommandSchema = v.object({
  type: v.literal('set-expanded'),
  id: v.string(),
  expanded: v.boolean()
})
const undoCommandSchema = v.object({ type: v.literal('undo') })
const redoCommandSchema = v.object({ type: v.literal('redo') })
const previewEditSchema = v.object({
  id: v.string(),
  fields: jsonRecordSchema
})
const previewCommandSchema = v.object({
  type: v.literal('preview'),
  edits: v.array(previewEditSchema)
})
const commitPreviewCommandSchema = v.object({ type: v.literal('commit-preview') })
const cancelPreviewCommandSchema = v.object({ type: v.literal('cancel-preview') })
const createComponentCommandSchema = v.object({
  type: v.literal('create-component'),
  id: v.string()
})
const resetOverrideCommandSchema = v.object({
  type: v.literal('reset-override'),
  id: v.string()
})
const setVariableCommandSchema = v.object({
  type: v.literal('set-variable'),
  name: v.string(),
  value: jsonValueSchema,
  theme: v.optional(v.record(v.string(), v.string()))
})
const deleteVariableCommandSchema = v.object({
  type: v.literal('delete-variable'),
  name: v.string()
})
const bindFieldCommandSchema = v.object({
  type: v.literal('bind-field'),
  id: v.string(),
  field: v.string(),
  variable: v.nullable(v.string())
})
const swapVariantCommandSchema = v.object({
  type: v.literal('swap-variant'),
  id: v.string(),
  properties: jsonRecordSchema
})
const setCommentCommandSchema = v.object({
  type: v.literal('set-comment'),
  nodeId: v.string(),
  threadId: v.string(),
  body: v.string(),
  resolved: v.boolean()
})
const setLintDismissalCommandSchema = v.object({
  type: v.literal('set-lint-dismissal'),
  nodeId: v.string(),
  ruleId: v.string(),
  dismissed: v.boolean()
})
const setShaderCommandSchema = v.object({
  type: v.literal('set-shader'),
  nodeId: v.string(),
  shader: v.nullable(jsonValueSchema)
})
const importLibraryCommandSchema = v.object({
  type: v.literal('import-library'),
  name: v.string(),
  path: v.string()
})

export const commandSchema = v.variant('type', [
  createCommandSchema,
  editCommandSchema,
  reparentCommandSchema,
  reorderCommandSchema,
  deleteCommandSchema,
  groupCommandSchema,
  booleanCommandSchema,
  setSelectionCommandSchema,
  setHoverCommandSchema,
  setToolCommandSchema,
  setViewportCommandSchema,
  setExpandedCommandSchema,
  undoCommandSchema,
  redoCommandSchema,
  previewCommandSchema,
  commitPreviewCommandSchema,
  cancelPreviewCommandSchema,
  createComponentCommandSchema,
  resetOverrideCommandSchema,
  setVariableCommandSchema,
  deleteVariableCommandSchema,
  bindFieldCommandSchema,
  swapVariantCommandSchema,
  setCommentCommandSchema,
  setLintDismissalCommandSchema,
  setShaderCommandSchema,
  importLibraryCommandSchema
])
export type Command = v.InferOutput<typeof commandSchema>

export const MUTATING_COMMANDS = [
  'create',
  'edit',
  'reparent',
  'reorder',
  'delete',
  'group',
  'boolean',
  'undo',
  'redo',
  'preview',
  'commit-preview',
  'cancel-preview',
  'create-component',
  'reset-override',
  'set-variable',
  'delete-variable',
  'bind-field',
  'swap-variant',
  'set-comment',
  'set-lint-dismissal',
  'set-shader',
  'import-library'
] as const

export type MutatingCommand = (typeof MUTATING_COMMANDS)[number]

export const commandAckSchema = v.object({
  accepted: v.boolean(),
  sequence: v.number(),
  reason: v.optional(v.string())
})
export type CommandAck = v.InferOutput<typeof commandAckSchema>

export const layerTreeQuerySchema = v.object({
  parentId: v.nullable(v.string()),
  offset: v.number(),
  limit: v.number()
})
export type LayerTreeQuery = v.InferOutput<typeof layerTreeQuerySchema>

export const layerRowSchema = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  depth: v.number(),
  childCount: v.number(),
  expanded: v.boolean(),
  selected: v.boolean(),
  visible: v.boolean()
})
export type LayerRow = v.InferOutput<typeof layerRowSchema>

export const layerTreeWindowSchema = v.object({
  parentId: v.nullable(v.string()),
  offset: v.number(),
  limit: v.number(),
  rows: v.array(layerRowSchema),
  total: v.number()
})
export type LayerTreeWindow = v.InferOutput<typeof layerTreeWindowSchema>

export const selectionPropertiesSchema = v.object({
  ids: v.array(v.string()),
  fields: v.record(v.string(), v.nullable(jsonValueSchema)),
  mixed: v.array(v.string())
})
export type SelectionProperties = v.InferOutput<typeof selectionPropertiesSchema>

export const boundsEntrySchema = v.object({
  id: v.string(),
  pageId: v.nullable(v.string()),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number()
})
export type BoundsEntry = v.InferOutput<typeof boundsEntrySchema>

export const spatialDeltaSchema = v.object({
  generation: v.number(),
  upsert: v.array(boundsEntrySchema),
  remove: v.array(v.string())
})
export type SpatialDelta = v.InferOutput<typeof spatialDeltaSchema>

export const tileRectSchema = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number()
})
export type TileRect = v.InferOutput<typeof tileRectSchema>

export const dirtyTileSchema = v.object({
  id: v.number(),
  generation: v.number(),
  rect: tileRectSchema,
  encoding: v.literal('rgba')
})
export type DirtyTile = v.InferOutput<typeof dirtyTileSchema>

export const sessionEventSchema = v.variant('type', [
  v.object({
    type: v.literal('spatial'),
    documentId: v.string(),
    delta: spatialDeltaSchema
  }),
  v.object({ type: v.literal('crashed'), documentId: v.string() }),
  v.object({ type: v.literal('recovered'), documentId: v.string() }),
  v.object({ type: v.literal('queued'), documentId: v.string() })
])
export type SessionEvent = v.InferOutput<typeof sessionEventSchema>

export const openDocumentSpecSchema = v.object({
  id: v.optional(v.string()),
  name: v.string(),
  readOnly: v.optional(v.boolean())
})
export type OpenDocumentSpec = v.InferOutput<typeof openDocumentSpecSchema> & {
  bytes?: Uint8Array
}

export const fontFaceSchema = v.object({
  family: v.string(),
  style: v.string(),
  weight: v.number(),
  path: v.string()
})
export type FontFace = v.InferOutput<typeof fontFaceSchema>

export const fontCatalogSchema = v.object({
  faces: v.array(fontFaceSchema)
})
export type FontCatalog = v.InferOutput<typeof fontCatalogSchema>

export const jobRequestSchema = v.object({
  id: v.optional(v.string()),
  documentId: v.string(),
  kind: jobKindSchema,
  payload: jsonValueSchema
})
export type JobRequest = v.InferOutput<typeof jobRequestSchema>

export const jobAckSchema = v.object({
  id: v.string(),
  accepted: v.boolean(),
  reason: v.optional(v.string())
})
export type JobAck = v.InferOutput<typeof jobAckSchema>

export const frameUpdateSchema = v.object({
  documentId: v.string(),
  tiles: v.array(dirtyTileSchema)
})
export type FrameUpdate = v.InferOutput<typeof frameUpdateSchema>

export interface ApplyResult {
  ack: CommandAck
  events: SessionEvent[]
}

const MUTATING = new Set<string>(MUTATING_COMMANDS)

export function isMutation(command: Command): boolean {
  return MUTATING.has(command.type)
}

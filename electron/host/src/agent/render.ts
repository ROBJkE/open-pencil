import * as v from 'valibot'

import type { GraphNode, JSONValue } from '@open-pencil/session'
import { jsonValueSchema } from '@open-pencil/session/schema'

/** Tool name the side scene follows. Other tools do not preview. */
export const RENDER_TOOL = 'render'

export interface StagedRender {
  parentId: string | null
  index: number | null
  nodes: GraphNode[]
}

interface RenderNodeInput {
  id: string
  type: string
  fields?: Record<string, JSONValue>
  children?: RenderNodeInput[]
}

const renderFieldsSchema = v.record(v.string(), jsonValueSchema)

const renderNodeSchema: v.GenericSchema<unknown, RenderNodeInput> = v.lazy(() =>
  v.object({
    id: v.pipe(v.string(), v.minLength(1)),
    type: v.pipe(v.string(), v.minLength(1)),
    fields: v.optional(renderFieldsSchema),
    children: v.optional(v.array(renderNodeSchema))
  })
)

const renderInputSchema = v.object({
  parentId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  index: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  nodes: v.pipe(v.array(renderNodeSchema), v.minLength(1))
})

type RenderInput = v.InferOutput<typeof renderInputSchema>

function parseRenderInput(input: unknown): RenderInput | null {
  if (typeof input === 'string') {
    const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), renderInputSchema), input)
    return parsed.success ? parsed.output : null
  }
  const parsed = v.safeParse(renderInputSchema, input)
  return parsed.success ? parsed.output : null
}

function flattenNodes(
  nodes: readonly RenderNodeInput[],
  parentId: string | null,
  seen: Set<string>,
  out: GraphNode[]
): boolean {
  for (const node of nodes) {
    if (seen.has(node.id)) return false
    seen.add(node.id)
    const children = node.children ?? []
    out.push({
      id: node.id,
      type: node.type,
      parentId,
      childIds: children.map((child) => child.id),
      fields: node.fields === undefined ? {} : structuredClone(node.fields),
      passthrough: {}
    })
    if (!flattenNodes(children, node.id, seen, out)) return false
  }
  return true
}

/** Validates a `render` payload and flattens it parent-before-children. */
export function readStagedRender(input: unknown): StagedRender | null {
  const parsed = parseRenderInput(input)
  if (!parsed) return null
  const parentId = parsed.parentId ?? null
  const nodes: GraphNode[] = []
  const seen = new Set<string>()
  if (!flattenNodes(parsed.nodes, parentId, seen, nodes)) return null
  if (parentId !== null && seen.has(parentId)) return null
  return { parentId, index: parsed.index ?? null, nodes }
}

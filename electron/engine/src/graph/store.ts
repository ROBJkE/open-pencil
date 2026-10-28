import {
  MAX_LAYER_ROWS,
  createOperationLog,
  type ApplyResult,
  type BoundsEntry,
  type Checkpoint,
  type Command,
  type CommandAck,
  type GraphNode,
  type JSONValue,
  type LayerDropPosition,
  type LayerTreeQuery,
  type LayerTreeWindow,
  type NodeDraft,
  type OpenDocumentSpec,
  type Operation,
  type OperationLog,
  type SelectionProperties,
  type SessionEvent,
  type ViewportSummary
} from '@open-pencil/session'

import type { DocumentCodec } from '../pen/codec'
import { runBuiltin } from './dispatch'
import {
  applyOps,
  cloneNode,
  indexOf,
  isAncestor,
  spatialEvent,
  subtree,
  withDescendants,
  type BagName,
  type GraphTables
} from './mutate'
import { planPlace } from './place'
import { ancestorBoxes, placementBox, worldRect, type PlacedNode } from './placement'

export interface CommandHandler {
  readonly command: Command['type']
  apply(document: DocumentStore, command: Command): ApplyResult | null
}

interface ViewportNumbers {
  zoom: number
  panX: number
  panY: number
  width: number
  height: number
}

function draftNode(draft: NodeDraft, parentId: string | null): GraphNode {
  return {
    id: draft.id && draft.id.length > 0 ? draft.id : crypto.randomUUID(),
    type: draft.type,
    parentId,
    childIds: [],
    fields: { ...draft.fields },
    passthrough: { ...draft.passthrough }
  }
}

function sameValue(left: JSONValue | undefined, right: JSONValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function childSlot(nodes: readonly GraphNode[], node: GraphNode): number {
  const parent = nodes.find((candidate) => candidate.id === node.parentId)
  const slot = parent?.childIds.indexOf(node.id) ?? 0
  return slot < 0 ? 0 : slot
}

export class DocumentStore implements GraphTables {
  readonly id: string
  readonly name: string
  readonly nodes = new Map<string, GraphNode>()
  readonly rootIds: string[] = []
  readonly selection = new Set<string>()
  readonly expanded = new Set<string>()
  readonly bags: Record<BagName, Record<string, JSONValue>> = {
    variables: {},
    comments: {},
    lintDismissals: {},
    shaders: {},
    libraries: {}
  }
  readonly preview = new Map<string, Record<string, JSONValue>>()
  hoverId: string | null = null
  generation = 0
  private tool: Checkpoint['tool'] = 'select'
  private currentPageId: string | null = null
  private viewport: ViewportNumbers = { zoom: 1, panX: 0, panY: 0, width: 0, height: 0 }
  private readonly log: OperationLog
  private disposed = false
  private readonly handlers: Map<string, CommandHandler>

  constructor(spec: OpenDocumentSpec, handlers: readonly CommandHandler[]) {
    this.id = spec.id && spec.id.length > 0 ? spec.id : crypto.randomUUID()
    this.name = spec.name
    this.log = createOperationLog()
    this.handlers = new Map(handlers.map((handler) => [handler.command, handler]))
  }

  getNode(id: string): GraphNode | undefined {
    const node = this.nodes.get(id)
    return node ? cloneNode(node) : undefined
  }

  bag(name: BagName): Record<string, JSONValue> {
    return this.bags[name]
  }

  apply(command: Command): ApplyResult {
    if (this.disposed) return { ack: this.fail('disposed'), events: [] }
    const handler = this.handlers.get(command.type)
    if (handler) {
      const handled = handler.apply(this, command)
      if (handled) return handled
    }
    return runBuiltin(this, command)
  }

  applyLogged(forward: Operation[], inverse: Operation[], coalesceKey: string | null): ApplyResult {
    if (forward.length === 0) return { ack: this.succeed(), events: [] }
    const removed: string[] = []
    const touched: string[] = []
    applyOps(this, forward, touched, removed)
    this.log.append(forward, inverse, coalesceKey)
    return { ack: this.succeed(), events: this.spatial(touched, removed) }
  }

  readLayerTree(query: LayerTreeQuery): LayerTreeWindow {
    const limit = Math.min(Math.max(1, Math.floor(query.limit)), MAX_LAYER_ROWS)
    const offset = Math.max(0, Math.floor(query.offset))
    const roots =
      query.parentId === null ? this.rootIds : (this.nodes.get(query.parentId)?.childIds ?? [])
    const rows: LayerTreeWindow['rows'] = []
    let total = 0
    const visit = (ids: readonly string[], depth: number): void => {
      for (const id of ids) {
        const node = this.nodes.get(id)
        if (!node) continue
        if (total >= offset && rows.length < limit) rows.push(this.row(node, depth))
        total += 1
        if (this.expanded.has(id)) visit(node.childIds, depth + 1)
      }
    }
    visit(roots, query.parentId === null ? 0 : 1)
    return { parentId: query.parentId, offset, limit, rows, total }
  }

  readSelection(): SelectionProperties {
    const ids = [...this.selection].filter((id) => this.nodes.has(id))
    if (ids.length === 0) return { ids: [], fields: {}, mixed: [] }
    const merged = ids.map((id) => this.mergedFields(id))
    const first = merged[0] ?? {}
    if (merged.length === 1) return { ids, fields: { ...first }, mixed: [] }
    const fields: SelectionProperties['fields'] = {}
    const mixed: string[] = []
    const keys = new Set(merged.flatMap((fieldsForNode) => Object.keys(fieldsForNode)))
    for (const key of keys) {
      const firstFields = merged[0]
      const head = firstFields[key]
      if (
        Object.hasOwn(firstFields, key) &&
        merged.every((fieldsForNode) => sameValue(fieldsForNode[key], head))
      ) {
        fields[key] = head
      } else {
        fields[key] = null
        mixed.push(key)
      }
    }
    return { ids, fields, mixed }
  }

  readViewport(): ViewportSummary {
    return { pageId: this.activePageId(), ...this.viewport }
  }

  readSpatialIndex(): BoundsEntry[] {
    const entries: BoundsEntry[] = []
    for (const node of this.nodes.values()) {
      const bounds = this.bounds(node)
      if (bounds) entries.push(bounds)
    }
    return entries
  }

  checkpoint(): Checkpoint {
    const history = this.log.history()
    return {
      version: 1,
      nodes: [...this.nodes.values()].map(cloneNode),
      rootIds: [...this.rootIds],
      selection: [...this.selection],
      hoverId: this.hoverId,
      tool: this.tool,
      viewport: this.readViewport(),
      expanded: [...this.expanded],
      entries: history.entries,
      undone: history.undone,
      variables: { ...this.bags.variables },
      comments: { ...this.bags.comments },
      lintDismissals: { ...this.bags.lintDismissals },
      shaders: { ...this.bags.shaders },
      libraries: { ...this.bags.libraries }
    }
  }

  restore(checkpoint: Checkpoint): void {
    this.nodes.clear()
    this.rootIds.splice(0, this.rootIds.length, ...checkpoint.rootIds)
    for (const node of checkpoint.nodes) this.nodes.set(node.id, cloneNode(node))
    this.selection.clear()
    for (const id of checkpoint.selection) this.selection.add(id)
    this.expanded.clear()
    for (const id of checkpoint.expanded) this.expanded.add(id)
    this.hoverId = checkpoint.hoverId
    this.tool = checkpoint.tool
    const pageId = checkpoint.viewport.pageId
    this.currentPageId = pageId !== null && checkpoint.rootIds.includes(pageId) ? pageId : null
    this.viewport = {
      zoom: checkpoint.viewport.zoom,
      panX: checkpoint.viewport.panX,
      panY: checkpoint.viewport.panY,
      width: checkpoint.viewport.width,
      height: checkpoint.viewport.height
    }
    this.preview.clear()
    this.assignBag('variables', checkpoint.variables)
    this.assignBag('comments', checkpoint.comments)
    this.assignBag('lintDismissals', checkpoint.lintDismissals)
    this.assignBag('shaders', checkpoint.shaders)
    this.assignBag('libraries', checkpoint.libraries)
    this.log.restore(checkpoint.entries, checkpoint.undone)
  }

  dispose(): void {
    this.disposed = true
    this.nodes.clear()
    this.preview.clear()
  }

  insertNode(parentId: string | null, index: number, draft: NodeDraft): ApplyResult {
    if (parentId !== null && !this.nodes.has(parentId)) {
      return { ack: this.fail('missing-parent'), events: [] }
    }
    const node = draftNode(draft, parentId)
    if (this.nodes.has(node.id)) return { ack: this.fail('duplicate-id'), events: [] }
    this.expanded.add(node.id)
    return this.applyLogged(
      [{ kind: 'put-node', node, index }],
      [{ kind: 'remove-node', id: node.id }],
      null
    )
  }

  /**
   * Inserts `nodes` (parent before descendants) as one undo step.
   * Roots are those whose `parentId` is the paste parent; their child lists are already filled.
   */
  insertFragment(parentId: string | null, index: number, nodes: readonly GraphNode[]): ApplyResult {
    if (this.disposed) return { ack: this.fail('disposed'), events: [] }
    if (parentId !== null && !this.nodes.has(parentId)) {
      return { ack: this.fail('missing-parent'), events: [] }
    }
    if (nodes.length === 0) return { ack: this.succeed(), events: [] }
    const seen = new Set<string>()
    for (const node of nodes) {
      if (this.nodes.has(node.id) || seen.has(node.id)) {
        return { ack: this.fail('duplicate-id'), events: [] }
      }
      seen.add(node.id)
    }
    const forward: Operation[] = []
    const removals: Operation[] = []
    let cursor = index
    for (const node of nodes) {
      const at = node.parentId === parentId ? cursor : childSlot(nodes, node)
      if (node.parentId === parentId) cursor += 1
      forward.push({ kind: 'put-node', node: cloneNode(node), index: at })
      removals.push({ kind: 'remove-node', id: node.id })
      this.expanded.add(node.id)
    }
    return this.applyLogged(forward, removals.toReversed(), null)
  }

  editFields(
    id: string,
    fields: Record<string, JSONValue>,
    coalesceKey: string | null
  ): ApplyResult {
    const node = this.nodes.get(id)
    if (!node) return { ack: this.fail('missing-node'), events: [] }
    const forwardFields: Record<string, JSONValue | null> = {}
    const inverseFields: Record<string, JSONValue | null> = {}
    for (const [key, value] of Object.entries(fields)) {
      forwardFields[key] = value
      inverseFields[key] = Object.hasOwn(node.fields, key) ? (node.fields[key] ?? null) : null
    }
    if (coalesceKey && this.log.tip(coalesceKey)) {
      applyOps(this, [{ kind: 'patch-fields', id, fields: forwardFields }], [], [])
      this.log.replaceTip([{ kind: 'patch-fields', id, fields: forwardFields }])
      return { ack: this.succeed(), events: this.spatial([id], []) }
    }
    return this.applyLogged(
      [{ kind: 'patch-fields', id, fields: forwardFields }],
      [{ kind: 'patch-fields', id, fields: inverseFields }],
      coalesceKey
    )
  }

  moveNode(id: string, parentId: string | null, index: number): ApplyResult {
    const node = this.nodes.get(id)
    if (!node) return { ack: this.fail('missing-node'), events: [] }
    if (parentId !== null && !this.nodes.has(parentId)) {
      return { ack: this.fail('missing-parent'), events: [] }
    }
    if (parentId === id || isAncestor(this, id, parentId)) {
      return { ack: this.fail('cycle'), events: [] }
    }
    const previousIndex = indexOf(this, node)
    return this.applyLogged(
      [{ kind: 'move', id, parentId, index }],
      [{ kind: 'move', id, parentId: node.parentId, index: previousIndex }],
      null
    )
  }

  reorderNode(id: string, index: number): ApplyResult {
    const node = this.nodes.get(id)
    if (!node) return { ack: this.fail('missing-node'), events: [] }
    return this.moveNode(id, node.parentId, index)
  }

  placeLayer(id: string, targetId: string, position: LayerDropPosition): ApplyResult {
    const plan = planPlace(this, id, targetId, position)
    if (!plan.ok) return { ack: this.fail(plan.error), events: [] }
    if (plan.expandId !== null) this.expanded.add(plan.expandId)
    if (plan.forward.length === 0) return { ack: this.succeed(), events: [] }
    return this.applyLogged(plan.forward, plan.inverse, null)
  }

  removeNodes(ids: readonly string[]): ApplyResult {
    const forward: Operation[] = []
    const inverse: Operation[] = []
    for (const id of ids) {
      const nodes = subtree(this, id)
      for (const node of [...nodes].reverse()) {
        forward.push({ kind: 'remove-node', id: node.id })
        inverse.unshift({ kind: 'put-node', node: cloneNode(node), index: indexOf(this, node) })
      }
    }
    if (forward.length === 0) return { ack: this.fail('missing-node'), events: [] }
    for (const id of ids) {
      this.selection.delete(id)
      this.expanded.delete(id)
      this.preview.delete(id)
    }
    return this.applyLogged(forward, inverse, null)
  }

  wrapNodes(ids: readonly string[], type: string, fields: Record<string, JSONValue>): ApplyResult {
    const nodes = ids.flatMap((id) => {
      const node = this.nodes.get(id)
      return node ? [node] : []
    })
    const parentId = nodes[0]?.parentId ?? null
    if (nodes.length === 0) return { ack: this.fail('missing-node'), events: [] }
    if (nodes.some((node) => node.parentId !== parentId)) {
      return { ack: this.fail('mixed-parents'), events: [] }
    }
    const index = nodes[0] ? indexOf(this, nodes[0]) : 0
    const wrapper = draftNode({ type, fields }, parentId)
    const forward: Operation[] = [{ kind: 'put-node', node: wrapper, index }]
    const inverse: Operation[] = [{ kind: 'remove-node', id: wrapper.id }]
    nodes.forEach((node, childIndex) => {
      forward.push({ kind: 'move', id: node.id, parentId: wrapper.id, index: childIndex })
      inverse.unshift({ kind: 'move', id: node.id, parentId, index: indexOf(this, node) })
    })
    this.expanded.add(wrapper.id)
    return this.applyLogged(forward, inverse, null)
  }

  select(ids: readonly string[]): ApplyResult {
    this.selection.clear()
    for (const id of ids) if (this.nodes.has(id)) this.selection.add(id)
    for (const id of ids) {
      const node = this.nodes.get(id)
      if (node?.parentId === null && this.rootIds.includes(node.id)) {
        this.currentPageId = node.id
        break
      }
    }
    return { ack: this.succeed(), events: [] }
  }

  hover(id: string | null): ApplyResult {
    this.hoverId = id !== null && this.nodes.has(id) ? id : null
    return { ack: this.succeed(), events: [] }
  }

  chooseTool(tool: Checkpoint['tool']): ApplyResult {
    this.tool = tool
    return { ack: this.succeed(), events: [] }
  }

  panZoom(zoom: number, panX: number, panY: number, width: number, height: number): ApplyResult {
    this.viewport = { zoom, panX, panY, width, height }
    return { ack: this.succeed(), events: [] }
  }

  expand(id: string, expanded: boolean): ApplyResult {
    if (expanded) this.expanded.add(id)
    else this.expanded.delete(id)
    return { ack: this.succeed(), events: [] }
  }

  undoChange(): ApplyResult {
    const entry = this.log.undo()
    if (!entry) return { ack: this.fail('empty-undo'), events: [] }
    const removed: string[] = []
    const touched: string[] = []
    applyOps(this, entry.inverse, touched, removed)
    return { ack: this.succeed(), events: this.spatial(touched, removed) }
  }

  redoChange(): ApplyResult {
    const entry = this.log.redo()
    if (!entry) return { ack: this.fail('empty-redo'), events: [] }
    const removed: string[] = []
    const touched: string[] = []
    applyOps(this, entry.forward, touched, removed)
    return { ack: this.succeed(), events: this.spatial(touched, removed) }
  }

  showPreview(edits: readonly { id: string; fields: Record<string, JSONValue> }[]): ApplyResult {
    this.preview.clear()
    for (const edit of edits) {
      if (this.nodes.has(edit.id)) this.preview.set(edit.id, { ...edit.fields })
    }
    return { ack: this.succeed(), events: this.spatial([...this.preview.keys()], []) }
  }

  commitPreview(): ApplyResult {
    const forward: Operation[] = []
    const inverse: Operation[] = []
    for (const [id, fields] of this.preview) {
      const node = this.nodes.get(id)
      if (!node) continue
      const forwardFields: Record<string, JSONValue | null> = {}
      const inverseFields: Record<string, JSONValue | null> = {}
      for (const [key, value] of Object.entries(fields)) {
        forwardFields[key] = value
        inverseFields[key] = Object.hasOwn(node.fields, key) ? (node.fields[key] ?? null) : null
      }
      forward.push({ kind: 'patch-fields', id, fields: forwardFields })
      inverse.push({ kind: 'patch-fields', id, fields: inverseFields })
    }
    this.preview.clear()
    return this.applyLogged(forward, inverse, null)
  }

  cancelPreview(): ApplyResult {
    const ids = [...this.preview.keys()]
    this.preview.clear()
    return { ack: this.succeed(), events: this.spatial(ids, []) }
  }

  writeBag(bag: BagName, key: string, value: JSONValue | null): ApplyResult {
    const current = this.bags[bag][key] ?? null
    return this.applyLogged(
      [{ kind: 'patch-bag', bag, key, value }],
      [{ kind: 'patch-bag', bag, key, value: current }],
      null
    )
  }

  succeed(): CommandAck {
    return { accepted: true, sequence: this.log.sequence }
  }

  fail(reason: string): CommandAck {
    return { accepted: false, sequence: this.log.sequence, reason }
  }

  private spatial(touched: readonly string[], removed: readonly string[]): SessionEvent[] {
    return spatialEvent(this, (node) => this.bounds(node), withDescendants(this, touched), removed)
  }

  private mergedFields(id: string): Record<string, JSONValue> {
    const node = this.nodes.get(id)
    if (!node) return {}
    return { ...node.fields, ...this.preview.get(id) }
  }

  private row(node: GraphNode, depth: number): LayerTreeWindow['rows'][number] {
    const fields = this.mergedFields(node.id)
    const name = typeof fields.name === 'string' ? fields.name : node.type
    const enabled = fields.enabled
    return {
      id: node.id,
      name,
      type: node.type,
      depth,
      childCount: node.childIds.length,
      expanded: this.expanded.has(node.id),
      selected: this.selection.has(node.id),
      visible: enabled !== false && enabled !== 'false'
    }
  }

  private geometry(id: string): PlacedNode | undefined {
    const node = this.nodes.get(id)
    if (!node) return undefined
    return { parentId: node.parentId, fields: this.mergedFields(id) }
  }

  private bounds(node: GraphNode): BoundsEntry | null {
    const box = placementBox(this.mergedFields(node.id))
    if (!box) return null
    const world = worldRect(
      ancestorBoxes(node.parentId, (id) => this.geometry(id)),
      box
    )
    const entry: BoundsEntry = {
      id: node.id,
      pageId: this.pageOf(node),
      x: world.x,
      y: world.y,
      width: world.width,
      height: world.height
    }
    if (box.x === world.x && box.y === world.y) return entry
    return { ...entry, localX: box.x, localY: box.y }
  }

  private activePageId(): string | null {
    if (this.currentPageId !== null && this.rootIds.includes(this.currentPageId)) {
      return this.currentPageId
    }
    return this.rootIds[0] ?? null
  }

  private pageOf(node: GraphNode): string | null {
    let current = node
    while (current.parentId !== null) {
      const parent = this.nodes.get(current.parentId)
      if (!parent) break
      current = parent
    }
    return current.parentId === null ? current.id : null
  }

  private assignBag(name: BagName, values: Record<string, JSONValue> | undefined): void {
    this.bags[name] = { ...values }
  }
}

export function loadBytes(
  codec: DocumentCodec,
  bytes: Uint8Array | undefined,
  store: DocumentStore
): void {
  if (!bytes || bytes.byteLength === 0) return
  store.restore(codec.read(bytes))
}

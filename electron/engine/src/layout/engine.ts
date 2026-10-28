import {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  GridTrackType,
  Gutter,
  Justify,
  Overflow,
  PositionType,
  loadYoga,
  type Config,
  type Node as YogaNode,
  type Yoga
} from 'yoga-layout/load'

import type { GraphNode } from '@open-pencil/session'

import {
  clipsContent,
  columnCount,
  crossAlign,
  finiteNumber,
  gapOf,
  isAbsolute,
  isVisible,
  layoutMode,
  mainAlign,
  paddingOf,
  rowCount,
  sizeSpec,
  storedBox,
  type CrossAlign,
  type LayoutMode,
  type MainAlign,
  type SizeSpec
} from './fields'
import { dirtySubtreeIds } from './scope'
import type { LayoutBox, LayoutResult } from './types'

interface Engine {
  readonly yoga: Yoga
  readonly config: Config
}

interface Built {
  readonly id: string
  readonly yoga: YogaNode
  readonly graph: GraphNode
  readonly children: Built[]
}

interface Tally {
  recomputed: number
}

type Axis = 'width' | 'height'
type Fill = 'grow' | 'stretch'

let pending: Promise<Engine> | null = null

/**
 * Flex and grid for document nodes. Yoga stays inside this module; callers see
 * boxes only. A dirty id lays out that node's subtree, not the rest of the file.
 */
export async function layoutNodes(
  nodes: readonly GraphNode[],
  dirtyIds: readonly string[]
): Promise<LayoutResult> {
  const scopeIds = dirtySubtreeIds(nodes, dirtyIds)
  if (!scopeNeedsLayout(nodes, scopeIds)) return storedLayout(nodes, scopeIds)
  return layoutWith(await engine(), nodes, scopeIds)
}

/** Instantiates Yoga. Rejects with a clear message when WASM fails to start. */
export async function loadLayoutEngine(): Promise<void> {
  await engine()
}

function engine(): Promise<Engine> {
  pending ??= createEngine()
  return pending
}

async function createEngine(): Promise<Engine> {
  try {
    const yoga = await loadYoga()
    const config = yoga.Config.create()
    config.setPointScaleFactor(0)
    return { yoga, config }
  } catch (error) {
    pending = null
    const detail = error instanceof Error ? error.message : 'unknown error'
    throw new Error(`Yoga WASM did not instantiate under bun: ${detail}`, { cause: error })
  }
}

function scopeNeedsLayout(nodes: readonly GraphNode[], scopeIds: readonly string[]): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return scopeIds.some((id) => {
    const node = byId.get(id)
    return node !== undefined && layoutMode(node) !== 'none'
  })
}

function storedLayout(nodes: readonly GraphNode[], scopeIds: readonly string[]): LayoutResult {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const boxes: LayoutBox[] = []
  for (const id of scopeIds) {
    const node = byId.get(id)
    if (!node) continue
    const box = storedBox(node)
    if (box) boxes.push(box)
  }
  return { boxes, recomputed: scopeIds.length }
}

function layoutWith(
  loaded: Engine,
  nodes: readonly GraphNode[],
  scopeIds: readonly string[]
): LayoutResult {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const scope = new Set(scopeIds)
  const boxes: LayoutBox[] = []
  const seen = new Set<string>()
  const tally: Tally = { recomputed: 0 }
  for (const id of scopeIds) {
    const node = byId.get(id)
    if (!node || layoutMode(node) === 'none' || flowAncestor(byId, node, scope)) continue
    const built = buildFlow(loaded, byId, node, scope, null, tally, seen)
    if (!built) continue
    try {
      built.yoga.calculateLayout(undefined, undefined, Direction.LTR)
      readBuilt(built, true, boxes)
    } finally {
      built.yoga.freeRecursive()
    }
  }
  for (const id of scopeIds) {
    if (seen.has(id)) continue
    tally.recomputed += 1
    const node = byId.get(id)
    if (!node) continue
    const box = storedBox(node)
    if (box) boxes.push(box)
  }
  return { boxes, recomputed: tally.recomputed }
}

function flowAncestor(
  byId: ReadonlyMap<string, GraphNode>,
  node: GraphNode,
  scope: ReadonlySet<string>
): boolean {
  const seen = new Set<string>()
  let parentId = node.parentId
  while (parentId !== null) {
    if (seen.has(parentId)) return false
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) return false
    if (scope.has(parent.id) && layoutMode(parent) !== 'none') return true
    parentId = parent.parentId
  }
  return false
}

function buildFlow(
  loaded: Engine,
  byId: ReadonlyMap<string, GraphNode>,
  node: GraphNode,
  scope: ReadonlySet<string>,
  parentMode: LayoutMode | null,
  tally: Tally,
  seen: Set<string>
): Built | undefined {
  if (seen.has(node.id)) return undefined
  seen.add(node.id)
  tally.recomputed += 1
  const yogaNode = loaded.yoga.Node.create(loaded.config)
  const built: Built = { id: node.id, yoga: yogaNode, graph: node, children: [] }
  const mode = layoutMode(node)
  if (parentMode === null) applyRootSize(yogaNode, node)
  else if (isAbsolute(node)) placeAbsolute(yogaNode, node)
  else sizeInParent(yogaNode, node, parentMode)
  if (mode === 'none') return built
  configureContainer(yogaNode, node, mode)
  for (const childId of node.childIds) {
    const child = byId.get(childId)
    if (!child || !scope.has(child.id) || !isVisible(child)) continue
    const childBuilt = buildFlow(loaded, byId, child, scope, mode, tally, seen)
    if (!childBuilt) continue
    yogaNode.insertChild(childBuilt.yoga, yogaNode.getChildCount())
    built.children.push(childBuilt)
  }
  return built
}

function readBuilt(built: Built, root: boolean, boxes: LayoutBox[]): void {
  const { fields } = built.graph
  boxes.push({
    id: built.id,
    x: root ? (finiteNumber(fields.x) ?? 0) : measured(built.yoga.getComputedLeft()),
    y: root ? (finiteNumber(fields.y) ?? 0) : measured(built.yoga.getComputedTop()),
    width: measured(built.yoga.getComputedWidth()),
    height: measured(built.yoga.getComputedHeight())
  })
  for (const child of built.children) readBuilt(child, false, boxes)
}

function configureContainer(yogaNode: YogaNode, node: GraphNode, mode: LayoutMode): void {
  const justify = mainAlign(node)
  const align = crossAlign(node)
  yogaNode.setJustifyContent(justifyEnum(justify))
  yogaNode.setAlignItems(alignEnum(align))
  if (clipsContent(node)) yogaNode.setOverflow(Overflow.Hidden)
  const padding = paddingOf(node.fields.padding)
  yogaNode.setPadding(Edge.Top, padding.top)
  yogaNode.setPadding(Edge.Right, padding.right)
  yogaNode.setPadding(Edge.Bottom, padding.bottom)
  yogaNode.setPadding(Edge.Left, padding.left)
  if (mode === 'grid') configureGrid(yogaNode, node, align)
  else configureFlex(yogaNode, node, mode, justify)
}

function configureFlex(
  yogaNode: YogaNode,
  node: GraphNode,
  mode: LayoutMode,
  justify: MainAlign
): void {
  yogaNode.setFlexDirection(mode === 'column' ? FlexDirection.Column : FlexDirection.Row)
  const gap = justify === 'space-between' ? 0 : gapOf(node)
  if (mode === 'column') {
    yogaNode.setGap(Gutter.Row, gap)
    yogaNode.setGap(Gutter.Column, 0)
    return
  }
  yogaNode.setGap(Gutter.Column, gap)
  yogaNode.setGap(Gutter.Row, 0)
}

function configureGrid(yogaNode: YogaNode, node: GraphNode, align: CrossAlign): void {
  yogaNode.setDisplay(Display.Grid)
  yogaNode.setJustifyItems(justifyItemEnum(align))
  yogaNode.setGridTemplateColumns(tracks(GridTrackType.Fr, columnCount(node), 1))
  const rows = rowCount(node)
  const autoRows = tracks(GridTrackType.Auto, rows ?? 1, 0)
  if (rows === undefined) yogaNode.setGridAutoRows(autoRows)
  else yogaNode.setGridTemplateRows(autoRows)
  const gap = gapOf(node)
  yogaNode.setGap(Gutter.Column, gap)
  yogaNode.setGap(Gutter.Row, gap)
}

function tracks(
  type: GridTrackType,
  count: number,
  value: number
): { type: GridTrackType; value: number }[] {
  const result: { type: GridTrackType; value: number }[] = []
  for (let index = 0; index < count; index += 1) result.push({ type, value })
  return result
}

function applyRootSize(yogaNode: YogaNode, node: GraphNode): void {
  applyRootAxis(yogaNode, node, 'width')
  applyRootAxis(yogaNode, node, 'height')
}

function applyRootAxis(yogaNode: YogaNode, node: GraphNode, axis: Axis): void {
  const spec = sizeSpec(axis === 'width' ? node.fields.width : node.fields.height, true)
  if (spec.mode === 'hug' && node.childIds.length > 0) return
  if (spec.mode === 'hug' && spec.value === undefined) return
  if (spec.value === undefined) return
  setAxis(yogaNode, axis, spec.value)
}

function placeAbsolute(yogaNode: YogaNode, node: GraphNode): void {
  yogaNode.setPositionType(PositionType.Absolute)
  yogaNode.setPosition(Edge.Left, finiteNumber(node.fields.x) ?? 0)
  yogaNode.setPosition(Edge.Top, finiteNumber(node.fields.y) ?? 0)
  sizeAxis(yogaNode, node, 'width', 'stretch')
  sizeAxis(yogaNode, node, 'height', 'stretch')
}

function sizeInParent(yogaNode: YogaNode, node: GraphNode, parentMode: LayoutMode): void {
  if (parentMode === 'grid') {
    sizeAxis(yogaNode, node, 'width', 'stretch')
    sizeAxis(yogaNode, node, 'height', 'stretch')
    return
  }
  const column = parentMode === 'column'
  sizeAxis(yogaNode, node, column ? 'height' : 'width', 'grow')
  sizeAxis(yogaNode, node, column ? 'width' : 'height', 'stretch')
}

function sizeAxis(yogaNode: YogaNode, node: GraphNode, axis: Axis, fill: Fill): void {
  const flow = layoutMode(node) !== 'none'
  const spec = sizeSpec(axis === 'width' ? node.fields.width : node.fields.height, flow)
  applyAxis(yogaNode, axis, spec, flow && node.childIds.length > 0, fill)
}

function applyAxis(
  yogaNode: YogaNode,
  axis: Axis,
  spec: SizeSpec,
  hugsContent: boolean,
  fill: Fill
): void {
  if (spec.mode === 'fill') {
    if (fill === 'grow') {
      yogaNode.setFlexGrow(1)
      yogaNode.setFlexShrink(1)
      yogaNode.setFlexBasis(0)
      return
    }
    if (axis === 'width') yogaNode.setWidthStretch()
    else yogaNode.setHeightStretch()
    return
  }
  if (spec.mode === 'hug' && hugsContent) return
  if (spec.value !== undefined) {
    setAxis(yogaNode, axis, spec.value)
    return
  }
  if (spec.mode === 'hug') setAxis(yogaNode, axis, 0)
}

function setAxis(yogaNode: YogaNode, axis: Axis, value: number): void {
  if (axis === 'width') yogaNode.setWidth(value)
  else yogaNode.setHeight(value)
}

const JUSTIFY = new Map<MainAlign, Justify>([
  ['start', Justify.FlexStart],
  ['center', Justify.Center],
  ['end', Justify.FlexEnd],
  ['space-between', Justify.SpaceBetween],
  ['space-around', Justify.SpaceAround]
])

const ALIGN = new Map<CrossAlign, Align>([
  ['start', Align.FlexStart],
  ['center', Align.Center],
  ['end', Align.FlexEnd],
  ['stretch', Align.Stretch],
  ['baseline', Align.Baseline]
])

const JUSTIFY_ITEMS = new Map<CrossAlign, Justify>([
  ['start', Justify.FlexStart],
  ['center', Justify.Center],
  ['end', Justify.FlexEnd],
  ['stretch', Justify.Stretch],
  ['baseline', Justify.FlexStart]
])

function justifyEnum(align: MainAlign): Justify {
  return JUSTIFY.get(align) ?? Justify.FlexStart
}

function alignEnum(align: CrossAlign): Align {
  return ALIGN.get(align) ?? Align.FlexStart
}

function justifyItemEnum(align: CrossAlign): Justify {
  return JUSTIFY_ITEMS.get(align) ?? Justify.FlexStart
}

function measured(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/**
 * Tree moves. Each layer remembers every parent it has been under, with a Lamport counter.
 * The highest counter wins; an equal counter breaks the tie by parent id. A cycle drops the
 * later placement. Siblings sort by fractional order key, then id.
 */

/** Parent key for the document root list. A real parent id is never empty. */
export const ROOT_PARENT = ''

export interface SharedNode {
  readonly id: string
  readonly parents: ReadonlyMap<string, number>
  readonly orderKey: string
}

export interface ResolvedPlace {
  readonly parentId: string | null
  readonly index: number
}

interface ParentEdge {
  readonly parentId: string
  readonly counter: number
}

const ON_PATH = 1
const SETTLED = 2

export function parentKey(parentId: string | null): string {
  return parentId ?? ROOT_PARENT
}

/** Order keys of the siblings that will sit beside `skipId`, in current sibling order. */
export function orderKeysBeside(
  nodes: readonly SharedNode[],
  parentId: string | null,
  skipId: string
): string[] {
  const places = resolvePlaces(nodes)
  const rows: { index: number; orderKey: string }[] = []
  for (const node of nodes) {
    if (node.id === skipId) continue
    const place = places.get(node.id)
    if (!place || place.parentId !== parentId) continue
    rows.push({ index: place.index, orderKey: node.orderKey })
  }
  rows.sort((left, right) => left.index - right.index)
  return rows.map((row) => row.orderKey)
}

export function resolvePlaces(nodes: readonly SharedNode[]): Map<string, ResolvedPlace> {
  const parents = assignParents(nodes)
  const groups = new Map<string | null, SharedNode[]>()
  for (const node of nodes) {
    const parentId = parents.get(node.id) ?? null
    const list = groups.get(parentId)
    if (list) list.push(node)
    else groups.set(parentId, [node])
  }
  const places = new Map<string, ResolvedPlace>()
  for (const [parentId, list] of groups) {
    list.sort(compareSiblings)
    let index = 0
    for (const node of list) {
      places.set(node.id, { parentId, index })
      index += 1
    }
  }
  return places
}

function compareSiblings(left: SharedNode, right: SharedNode): number {
  if (left.orderKey !== right.orderKey) return left.orderKey < right.orderKey ? -1 : 1
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

function compareEdges(left: ParentEdge, right: ParentEdge): number {
  if (left.counter !== right.counter) return right.counter - left.counter
  if (left.parentId === right.parentId) return 0
  return left.parentId < right.parentId ? 1 : -1
}

function validEdges(
  id: string,
  parents: ReadonlyMap<string, number>,
  known: ReadonlySet<string>
): ParentEdge[] {
  const edges: ParentEdge[] = []
  for (const [parentId, counter] of parents) {
    if (parentId === id) continue
    if (parentId !== ROOT_PARENT && !known.has(parentId)) continue
    edges.push({ parentId, counter })
  }
  edges.sort(compareEdges)
  return edges
}

function assignParents(nodes: readonly SharedNode[]): Map<string, string | null> {
  const known = new Set(nodes.map((node) => node.id))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ranked = new Map<string, ParentEdge[]>()
  const choice = new Map<string, number>()
  const assigned = new Map<string, string | null>()
  const counters = new Map<string, number>()

  const assignOne = (id: string, parents: ReadonlyMap<string, number>) => {
    let edges = ranked.get(id)
    if (!edges) {
      edges = validEdges(id, parents, known)
      ranked.set(id, edges)
    }
    const index = choice.get(id) ?? 0
    const edge = index < edges.length ? edges[index] : undefined
    if (edge) {
      assigned.set(id, edge.parentId === ROOT_PARENT ? null : edge.parentId)
      counters.set(id, edge.counter)
      return
    }
    assigned.set(id, null)
    counters.set(id, -1)
  }

  for (const node of nodes) assignOne(node.id, node.parents)
  const ids = nodes.map((node) => node.id)
  const parentOf = (id: string) => assigned.get(id) ?? null
  const limit = nodes.length * nodes.length + 1
  for (let step = 0; step < limit; step += 1) {
    const loops = findLoops(ids, parentOf)
    if (loops.length === 0) break
    for (const loop of loops) breakLoop(loop, choice, counters, byId, assignOne)
  }
  return assigned
}

function breakLoop(
  loop: readonly string[],
  choice: Map<string, number>,
  counters: ReadonlyMap<string, number>,
  byId: ReadonlyMap<string, SharedNode>,
  assignOne: (id: string, parents: ReadonlyMap<string, number>) => void
): void {
  if (loop.length === 0) return
  let latest = loop[0]
  for (const id of loop) {
    if (isLater(id, latest, counters)) latest = id
  }
  choice.set(latest, (choice.get(latest) ?? 0) + 1)
  const parents = byId.get(latest)?.parents
  if (parents) assignOne(latest, parents)
}

function isLater(id: string, other: string, counters: ReadonlyMap<string, number>): boolean {
  const left = counters.get(id) ?? -1
  const right = counters.get(other) ?? -1
  if (left === right) return id > other
  return left > right
}

function findLoops(ids: readonly string[], parentOf: (id: string) => string | null): string[][] {
  const state = new Map<string, number>()
  const loops: string[][] = []
  for (const start of ids) {
    const path: string[] = []
    let id: string | null = start
    while (id !== null && !state.has(id)) {
      state.set(id, ON_PATH)
      path.push(id)
      id = parentOf(id)
    }
    if (id !== null && state.get(id) === ON_PATH) {
      const at = path.indexOf(id)
      if (at !== -1) loops.push(path.slice(at))
    }
    for (const visited of path) state.set(visited, SETTLED)
  }
  return loops
}

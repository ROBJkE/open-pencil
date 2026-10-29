import { lintNode } from './run'
import type { LintContext, LintFinding } from './types'
import { insideInstance } from './walk'

/**
 * Walks every layer once and yields findings as it goes.
 * Used for open, variable changes, and lint config changes.
 */
export function* lintDocument(context: LintContext): Generator<LintFinding> {
  const seen = new Set<string>()
  yield* walk(context.roots, context, seen)
  const rest: string[] = []
  for (const [id, node] of context.nodes) {
    if (!seen.has(id) && !insideInstance(node, context.nodes)) rest.push(id)
  }
  yield* walk(rest, context, seen)
}

function* walk(
  seeds: readonly string[],
  context: LintContext,
  seen: Set<string>
): Generator<LintFinding> {
  const pending = seeds.toReversed()
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const node = context.nodes.get(id)
    if (!node || insideInstance(node, context.nodes)) continue
    yield* lintNode(node, context)
    if (node.type === 'ref') continue
    for (const childId of node.childIds.toReversed()) pending.push(childId)
  }
}

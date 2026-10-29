import { describe, expect, test } from 'bun:test'

import { lintContext, lintDocument, lintNode, recheckIds, RULE_IDS, RULE_SEVERITY } from '#engine/lint/index'

import { createDocumentEngine } from '@open-pencil/engine'
import type { GraphNode, JSONValue } from '@open-pencil/session'

function layer(
  id: string,
  type: string,
  parentId: string | null,
  childIds: readonly string[],
  fields: Record<string, JSONValue> = {}
): GraphNode {
  return { id, type, parentId, childIds: [...childIds], fields, passthrough: {} }
}

describe('design checks', () => {
  test('a default-named rectangle is found, and renaming it rechecks only that node', () => {
    const engine = createDocumentEngine({ name: 'checks', id: 'checks' })
    engine.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: {
        id: 'rect',
        type: 'rectangle',
        fields: { name: 'Rectangle', width: 80, height: 40 }
      }
    })
    const opened = engine.checkpoint()
    const found = [...lintDocument(lintContext(opened.nodes, opened))]
    expect(found.some((finding) => finding.ruleId === 'no-default-names' && finding.nodeId === 'rect')).toBe(
      true
    )

    engine.apply({ type: 'edit', id: 'rect', fields: { name: 'Hero' } })
    const renamed = engine.checkpoint()
    const context = lintContext(renamed.nodes, renamed)
    expect(recheckIds({ kind: 'edit', id: 'rect', fields: ['name'] }, context)).toEqual(['rect'])
    const node = context.nodes.get('rect')
    expect(node).toBeDefined()
    if (!node) return
    expect(lintNode(node, context).some((finding) => finding.ruleId === 'no-default-names')).toBe(false)
  })

  test('low-contrast text is an error, and contrast is the only error', () => {
    const frame = layer('card', 'frame', null, ['label'], {
      name: 'Card',
      width: 200,
      height: 80,
      fill: '#FFFFFF'
    })
    const label = layer('label', 'text', 'card', [], {
      name: 'Label',
      content: 'Hello',
      width: 80,
      height: 20,
      fontSize: 16,
      fill: '#CCCCCC'
    })
    const finding = lintNode(label, lintContext([frame, label])).find(
      (item) => item.ruleId === 'color-contrast'
    )
    expect(finding?.severity).toBe('error')
    expect(RULE_IDS.filter((id) => RULE_SEVERITY[id] === 'error')).toEqual(['color-contrast'])
  })

  test('a one-click fix is an edit the caller can undo', () => {
    const engine = createDocumentEngine({ name: 'fix', id: 'fix' })
    engine.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: {
        id: 'label',
        type: 'text',
        fields: { name: 'Label', content: 'Hello', fontSize: 8, width: 40, height: 12 }
      }
    })
    const created = engine.checkpoint()
    const label = created.nodes.find((node) => node.id === 'label')
    expect(label).toBeDefined()
    if (!label) return
    const finding = lintNode(label, lintContext(created.nodes, created)).find(
      (item) => item.ruleId === 'min-text-size'
    )
    expect(finding?.command).toEqual({ type: 'edit', id: 'label', fields: { fontSize: 12 } })
    const command = finding?.command
    if (command?.type !== 'edit') throw new Error('expected an edit command')
    engine.apply(command)
    expect(engine.getNode('label')?.fields.fontSize).toBe(12)
    engine.apply({ type: 'undo' })
    expect(engine.getNode('label')?.fields.fontSize).toBe(8)
  })

  test('a dismissed finding is omitted', () => {
    const engine = createDocumentEngine({ name: 'dismiss', id: 'dismiss' })
    engine.apply({
      type: 'create',
      parentId: null,
      index: 0,
      node: { id: 'rect', type: 'rectangle', fields: { name: 'Rectangle', width: 80, height: 40 } }
    })
    engine.apply({
      type: 'set-lint-dismissal',
      nodeId: 'rect',
      ruleId: 'no-default-names',
      dismissed: true
    })
    const checkpoint = engine.checkpoint()
    const context = lintContext(checkpoint.nodes, checkpoint)
    const node = context.nodes.get('rect')
    expect(node).toBeDefined()
    if (!node) return
    expect(checkpoint.lintDismissals?.['rect:no-default-names']).toBe(true)
    expect(lintNode(node, context).some((finding) => finding.ruleId === 'no-default-names')).toBe(false)
  })
})

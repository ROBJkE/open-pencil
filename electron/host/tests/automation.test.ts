import { describe, expect, test } from 'bun:test'

import {
  createAutomationSession,
  DEFAULT_EXPORT_FORMAT,
  DROP_LIST,
  EXPORT_FORMATS,
  INVALID_INPUT,
  NOT_IN_THIS_MILESTONE,
  OUTSIDE_SELECTION,
  TOOL_NAMES,
  UNSUPPORTED_SCRIPT,
  type AutomationSession
} from '#host/automation'

import { createDocumentEngine, type DocumentStore } from '@open-pencil/engine'

function board() {
  const store = createDocumentEngine({ name: 'Board', id: 'board' })
  return {
    store,
    document: createAutomationSession(store, 'document'),
    selection: createAutomationSession(store, 'selection')
  }
}

function draft(id: string, parentId: string | null, index: number) {
  return {
    parentId,
    index,
    node: { id, type: 'rectangle', fields: { name: id } }
  }
}

function fingerprint(store: DocumentStore): string {
  const checkpoint = store.checkpoint()
  return JSON.stringify({
    nodes: checkpoint.nodes,
    rootIds: checkpoint.rootIds,
    selection: checkpoint.selection,
    entries: checkpoint.entries,
    undone: checkpoint.undone
  })
}

describe('automation registry', () => {
  test('lists the current core tool names once', () => {
    expect(TOOL_NAMES).toHaveLength(127)
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length)
    expect(TOOL_NAMES[0]).toBe('get_selection')
    expect(TOOL_NAMES[24]).toBe('eval')
    expect(TOOL_NAMES[TOOL_NAMES.length - 1]).toBe('design_to_component_map')
    expect(TOOL_NAMES).toContain('create_shape')
    expect(TOOL_NAMES).toContain('update_node')
    expect(TOOL_NAMES).toContain('delete_node')
    expect(TOOL_NAMES).toContain('query_nodes')
  })

  test('records the drop list and the pen default', () => {
    expect(DROP_LIST).toEqual(['CLI convert', 'FIG export', '.fig import'])
    expect(DEFAULT_EXPORT_FORMAT).toBe('pen')
    expect(EXPORT_FORMATS).toEqual(['pen', 'json'])
    expect(EXPORT_FORMATS).toContain(DEFAULT_EXPORT_FORMAT)
    expect(EXPORT_FORMATS).not.toContain('FIG')
    expect(EXPORT_FORMATS).not.toContain('fig')
    expect(EXPORT_FORMATS).not.toContain('.fig')
  })
})

describe('automation tools', () => {
  test('create, update, delete, and query run as session commands', () => {
    const { store, document } = board()
    expect(document.call('create_shape', draft('frame', null, 0)).ok).toBe(true)
    expect(document.call('create_page', draft('page', null, 1)).ok).toBe(true)
    expect(store.getNode('frame')?.type).toBe('rectangle')
    expect(store.getNode('page')?.parentId).toBeNull()

    const updated = document.call('update_node', { id: 'frame', fields: { name: 'Frame' } })
    expect(updated.ok).toBe(true)
    expect(store.getNode('frame')?.fields.name).toBe('Frame')

    const batched = document.call('batch_update', {
      operations: [
        { id: 'frame', fields: { name: 'Card' } },
        { id: 'page', fields: { name: 'Page' } }
      ]
    })
    expect(batched.ok).toBe(true)
    expect(store.getNode('frame')?.fields.name).toBe('Card')
    expect(store.getNode('page')?.fields.name).toBe('Page')

    const queried = document.call('query_nodes', {})
    expect(queried.nodes?.map((node) => node.id)).toEqual(['frame', 'page'])
    expect(document.call('query_nodes', { id: 'page' }).node?.fields.name).toBe('Page')

    expect(document.call('delete_node', { id: 'page' }).ok).toBe(true)
    expect(store.getNode('page')).toBeUndefined()
    expect(document.call('delete_node', { ids: ['frame'] }).ok).toBe(true)
    expect(store.getNode('frame')).toBeUndefined()
  })

  test('a generated id is returned from create', () => {
    const { store, document } = board()
    const created = document.call('create_shape', {
      parentId: null,
      index: 0,
      node: { type: 'ellipse', fields: { name: 'Orb' } }
    })
    expect(created.ok).toBe(true)
    expect(created.node?.fields.name).toBe('Orb')
    expect(store.getNode(created.node?.id ?? '')?.type).toBe('ellipse')
  })

  test('other names do not touch the document', () => {
    const { store, document } = board()
    document.call('create_shape', draft('frame', null, 0))
    const before = fingerprint(store)
    expect(document.call('set_fill', { id: 'frame', fields: { name: 'Nope' } })).toEqual({
      ok: false,
      reason: NOT_IN_THIS_MILESTONE
    })
    expect(document.call('eval', { code: 'openpencil.getNode("frame")' })).toEqual({
      ok: false,
      reason: NOT_IN_THIS_MILESTONE
    })
    expect(document.call('create_variable', { name: 'color' })).toEqual({
      ok: false,
      reason: NOT_IN_THIS_MILESTONE
    })
    expect(document.call('delete_variable', { name: 'color' })).toEqual({
      ok: false,
      reason: NOT_IN_THIS_MILESTONE
    })
    expect(document.call('reparent_node', { id: 'frame' })).toEqual({
      ok: false,
      reason: NOT_IN_THIS_MILESTONE
    })
    expect(document.call('not_a_tool', {})).toEqual({
      ok: false,
      reason: NOT_IN_THIS_MILESTONE
    })
    expect(fingerprint(store)).toBe(before)
    expect(NOT_IN_THIS_MILESTONE).toBe('not-in-this-milestone')
  })

  test('invalid input is refused before a command', () => {
    const { store, document } = board()
    const before = fingerprint(store)
    expect(document.call('create_shape', { type: 'RECTANGLE' })).toEqual({
      ok: false,
      reason: INVALID_INPUT
    })
    expect(document.call('update_node', { id: 'missing' })).toEqual({
      ok: false,
      reason: INVALID_INPUT
    })
    expect(fingerprint(store)).toBe(before)
  })

  test('a missing node reports the store reason', () => {
    const { document } = board()
    expect(document.call('update_node', { id: 'missing', fields: { name: 'X' } })).toEqual({
      ok: false,
      reason: 'missing-node'
    })
    expect(document.call('delete_node', { ids: ['missing'] })).toEqual({
      ok: false,
      reason: 'missing-node'
    })
  })
})

describe('automation selection scope', () => {
  function seed(document: AutomationSession) {
    document.call('create_shape', draft('frame', null, 0))
    document.call('create_shape', draft('other', null, 1))
    document.call('create_shape', draft('child', 'frame', 0))
  }

  test('a write outside the selection is rejected', () => {
    const { store, document, selection } = board()
    seed(document)
    store.apply({ type: 'set-selection', ids: ['frame'] })

    expect(selection.call('update_node', { id: 'other', fields: { name: 'Nope' } })).toEqual({
      ok: false,
      reason: OUTSIDE_SELECTION
    })
    expect(store.getNode('other')?.fields.name).toBe('other')

    expect(selection.call('update_node', { id: 'frame', fields: { name: 'Frame' } }).ok).toBe(true)
    expect(store.getNode('frame')?.fields.name).toBe('Frame')

    expect(selection.call('update_node', { id: 'child', fields: { name: 'Child' } }).ok).toBe(true)
    expect(store.getNode('child')?.fields.name).toBe('Child')

    expect(selection.call('delete_node', { id: 'other' })).toEqual({
      ok: false,
      reason: OUTSIDE_SELECTION
    })
    expect(store.getNode('other')).toBeDefined()

    const before = fingerprint(store)
    expect(
      selection.call('batch_update', {
        operations: [
          { id: 'frame', fields: { name: 'Changed' } },
          { id: 'other', fields: { name: 'Changed' } }
        ]
      })
    ).toEqual({ ok: false, reason: OUTSIDE_SELECTION })
    expect(fingerprint(store)).toBe(before)
  })

  test('query and create stay inside the selection', () => {
    const { store, document, selection } = board()
    seed(document)
    store.apply({ type: 'set-selection', ids: ['frame'] })

    expect(selection.call('query_nodes', {}).nodes?.map((node) => node.id)).toEqual(['frame'])
    expect(selection.call('query_nodes', { id: 'child' }).node?.id).toBe('child')
    expect(
      selection.call('query_nodes', { parentId: 'frame' }).nodes?.map((node) => node.id)
    ).toEqual(['child'])
    expect(selection.call('query_nodes', { id: 'other' })).toEqual({
      ok: false,
      reason: OUTSIDE_SELECTION
    })

    expect(selection.call('create_shape', draft('nested', 'frame', 1)).ok).toBe(true)
    expect(store.getNode('nested')?.parentId).toBe('frame')
    expect(selection.call('create_shape', draft('loose', null, 0))).toEqual({
      ok: false,
      reason: OUTSIDE_SELECTION
    })
    expect(store.getNode('loose')).toBeUndefined()
  })
})

describe('automation eval', () => {
  test('reads a node and writes a field through openpencil', () => {
    const { store, document } = board()
    document.call('create_shape', draft('frame', null, 0))
    const result = document.eval(`
      openpencil.setField("frame", "name", "After");
      openpencil.getNode("frame");
    `)
    expect(result.ok).toBe(true)
    expect(result.node?.id).toBe('frame')
    expect(result.node?.fields.name).toBe('After')
    expect(store.getNode('frame')?.fields.name).toBe('After')

    document.eval('openpencil.setField("frame", "width", 40)')
    document.eval("openpencil.setField('frame', 'visible', false)")
    document.eval('openpencil.setField("frame", "name", "A \\"quoted\\" name")')
    expect(store.getNode('frame')?.fields.width).toBe(40)
    expect(store.getNode('frame')?.fields.visible).toBe(false)
    expect(store.getNode('frame')?.fields.name).toBe('A "quoted" name')

    document.eval('openpencil.setField("frame", "note", "hi")')
    document.eval('openpencil.setField("frame", "note", null)')
    expect(store.getNode('frame')?.fields.note).toBeUndefined()

    const spaced = document.eval('  openpencil.getNode( "frame" ) ; ')
    expect(spaced.node?.fields.width).toBe(40)
  })

  test('rejects anything other than the two openpencil calls', () => {
    const { store, document } = board()
    document.call('create_shape', draft('frame', null, 0))
    const before = fingerprint(store)
    expect(document.eval('figma.getNodeById("frame")')).toEqual({
      ok: false,
      reason: UNSUPPORTED_SCRIPT
    })
    expect(document.eval('eval("1")')).toEqual({ ok: false, reason: UNSUPPORTED_SCRIPT })
    expect(document.eval('new Function("return 1")()')).toEqual({
      ok: false,
      reason: UNSUPPORTED_SCRIPT
    })
    expect(document.eval('openpencil.setField("frame", "name", { text: "no" })')).toEqual({
      ok: false,
      reason: UNSUPPORTED_SCRIPT
    })
    expect(
      document.eval(`
        openpencil.setField("frame", "name", "Nope");
        figma.notify("hi");
      `)
    ).toEqual({ ok: false, reason: UNSUPPORTED_SCRIPT })
    expect(fingerprint(store)).toBe(before)
    expect(Object.hasOwn(globalThis, 'figma')).toBe(false)
    expect(Object.hasOwn(globalThis, 'openpencil')).toBe(false)
  })

  test('a script write outside the selection is rejected', () => {
    const { store, document, selection } = board()
    document.call('create_shape', draft('frame', null, 0))
    document.call('create_shape', draft('other', null, 1))
    document.call('create_shape', draft('child', 'frame', 0))
    store.apply({ type: 'set-selection', ids: ['frame'] })

    expect(selection.eval('openpencil.setField("other", "name", "Nope")')).toEqual({
      ok: false,
      reason: OUTSIDE_SELECTION
    })
    expect(store.getNode('other')?.fields.name).toBe('other')
    expect(selection.eval('openpencil.getNode("other")')).toEqual({
      ok: false,
      reason: OUTSIDE_SELECTION
    })

    const renamed = selection.eval('openpencil.setField("child", "name", "Nested")')
    expect(renamed.ok).toBe(true)
    expect(store.getNode('child')?.fields.name).toBe('Nested')
    expect(selection.eval('openpencil.getNode("child")').node?.id).toBe('child')

    const mixed = selection.eval(`
      openpencil.setField("frame", "name", "Ok");
      openpencil.setField("other", "name", "Nope");
    `)
    expect(mixed).toEqual({ ok: false, reason: OUTSIDE_SELECTION })
    expect(store.getNode('frame')?.fields.name).toBe('Ok')
    expect(store.getNode('other')?.fields.name).toBe('other')
  })
})

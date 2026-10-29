import type { ApplyResult, Command, JSONValue } from '@open-pencil/session'

import type { DocumentStore } from './store'

type Builtin = (store: DocumentStore, command: Command) => ApplyResult

function unimplemented(store: DocumentStore): ApplyResult {
  return { ack: store.fail('unimplemented'), events: [] }
}

const HANDLERS: Record<Command['type'], Builtin> = {
  create: (store, command) =>
    command.type === 'create'
      ? store.insertNode(command.parentId, command.index, command.node)
      : unimplemented(store),
  edit: (store, command) =>
    command.type === 'edit'
      ? store.editFields(command.id, command.fields, command.coalesceKey ?? null)
      : unimplemented(store),
  reparent: (store, command) =>
    command.type === 'reparent'
      ? store.moveNode(command.id, command.parentId, command.index)
      : unimplemented(store),
  reorder: (store, command) =>
    command.type === 'reorder'
      ? store.reorderNode(command.id, command.index)
      : unimplemented(store),
  'place-layer': (store, command) =>
    command.type === 'place-layer'
      ? store.placeLayer(command.id, command.targetId, command.position)
      : unimplemented(store),
  delete: (store, command) =>
    command.type === 'delete' ? store.removeNodes(command.ids) : unimplemented(store),
  group: (store, command) =>
    command.type === 'group' ? store.wrapNodes(command.ids, 'group', {}) : unimplemented(store),
  boolean: (store, command) =>
    command.type === 'boolean'
      ? store.wrapNodes(command.ids, 'boolean', { op: command.op })
      : unimplemented(store),
  'set-selection': (store, command) =>
    command.type === 'set-selection' ? store.select(command.ids) : unimplemented(store),
  'set-hover': (store, command) =>
    command.type === 'set-hover' ? store.hover(command.id) : unimplemented(store),
  'set-tool': (store, command) =>
    command.type === 'set-tool' ? store.chooseTool(command.tool) : unimplemented(store),
  'set-viewport': (store, command) =>
    command.type === 'set-viewport'
      ? store.panZoom(command.zoom, command.panX, command.panY, command.width, command.height)
      : unimplemented(store),
  'set-expanded': (store, command) =>
    command.type === 'set-expanded'
      ? store.expand(command.id, command.expanded)
      : unimplemented(store),
  undo: (store) => store.undoChange(),
  redo: (store) => store.redoChange(),
  preview: (store, command) =>
    command.type === 'preview' ? store.showPreview(command.edits) : unimplemented(store),
  'commit-preview': (store) => store.commitPreview(),
  'cancel-preview': (store) => store.cancelPreview(),
  'set-variable': (store, command) =>
    command.type === 'set-variable'
      ? store.writeBag('variables', command.name, variableValue(command.value, command.theme))
      : unimplemented(store),
  'delete-variable': (store, command) =>
    command.type === 'delete-variable'
      ? store.writeBag('variables', command.name, null)
      : unimplemented(store),
  'bind-field': (store, command) =>
    command.type === 'bind-field'
      ? store.editFields(
          command.id,
          { [command.field]: command.variable === null ? null : `$${command.variable}` },
          null
        )
      : unimplemented(store),
  'create-component': (store, command) =>
    command.type === 'create-component'
      ? store.editFields(command.id, { reusable: true }, null)
      : unimplemented(store),
  'set-comment': (store, command) =>
    command.type === 'set-comment'
      ? store.writeBag('comments', command.threadId, {
          nodeId: command.nodeId,
          body: command.body,
          resolved: command.resolved
        })
      : unimplemented(store),
  'set-lint-dismissal': (store, command) =>
    command.type === 'set-lint-dismissal'
      ? store.writeBag('lintDismissals', `${command.nodeId}:${command.ruleId}`, command.dismissed)
      : unimplemented(store),
  'set-shader': (store, command) =>
    command.type === 'set-shader'
      ? store.writeBag('shaders', command.nodeId, command.shader)
      : unimplemented(store),
  'import-library': (store, command) =>
    command.type === 'import-library'
      ? store.writeBag('libraries', command.name, command.path)
      : unimplemented(store),
  'reset-override': (store) => unimplemented(store),
  'swap-variant': (store) => unimplemented(store)
}

function variableValue(value: JSONValue, theme: Record<string, string> | undefined): JSONValue {
  if (!theme) return { value }
  return { value, theme }
}

export function runBuiltin(store: DocumentStore, command: Command): ApplyResult {
  return HANDLERS[command.type](store, command)
}

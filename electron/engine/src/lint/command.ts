import type { Command, JSONValue } from '@open-pencil/session'

export function editCommand(id: string, fields: Record<string, JSONValue>): Command {
  return { type: 'edit', id, fields }
}

export function deleteCommand(id: string): Command {
  return { type: 'delete', ids: [id] }
}

export function bindCommand(id: string, field: 'fill' | 'stroke', variable: string): Command {
  return { type: 'bind-field', id, field, variable }
}

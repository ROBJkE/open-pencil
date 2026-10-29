import { createDocumentEngine } from '@open-pencil/engine'
import { createLocalSession, type SessionClient } from '@open-pencil/session'

export interface EditableDocument {
  client: SessionClient
  documentId: string
  x: number
}

/** Editable session on the document engine. A scrub is a preview, then one commit. */
export async function openEditableDocument(): Promise<EditableDocument> {
  const { client } = createLocalSession({
    cpuCount: 2,
    factory: {
      open(spec) {
        return createDocumentEngine(spec)
      }
    }
  })
  const documentId = await client.openDocument({ name: 'Editable' })
  await client.submit(documentId, {
    type: 'create',
    parentId: null,
    index: 0,
    node: {
      id: 'rect',
      type: 'rectangle',
      fields: { name: 'Rectangle', x: 1, y: 2, width: 10, height: 10 }
    }
  })
  await client.submit(documentId, { type: 'set-selection', ids: ['rect'] })
  await client.submit(documentId, {
    type: 'preview',
    edits: [{ id: 'rect', fields: { x: 24 } }]
  })
  const during = await client.selection(documentId)
  if (during.fields.x !== 24) throw new Error('preview did not update the selection')
  await client.submit(documentId, { type: 'commit-preview' })
  const after = await client.selection(documentId)
  const x = after.fields.x
  if (typeof x !== 'number') throw new Error('committed selection has no numeric x')
  return { client, documentId, x }
}

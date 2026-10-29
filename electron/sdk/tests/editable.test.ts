import { describe, expect, test } from 'bun:test'

import { openEditableDocument } from './examples/editable'

describe('editable session', () => {
  test('commits a preview onto the document engine', async () => {
    const document = await openEditableDocument()
    expect(document.x).toBe(24)
    const selection = await document.client.selection(document.documentId)
    expect(selection.fields.x).toBe(24)
  })
})

import { describe, expect, test } from 'bun:test'

import * as v from 'valibot'

import { parsePenDocument, parsePenFile } from '@open-pencil/pen'

import { penDocumentSchema } from '../src/schema'
import { FIXTURES } from './helpers/paths'

const document = {
  version: '2.8',
  vendor: { keep: true },
  comments: {
    thread: { nodeId: 'rect', body: 'Check the spacing', resolved: false, author: 'ada' }
  },
  shaders: { rect: { components: [{ type: 'noise', speed: 1 }], structureVersion: 1 } },
  lintDismissals: {
    'rect:contrast': true,
    'rect:spacing': { dismissed: false, note: 'later' }
  },
  children: [{ id: 'rect', type: 'rectangle', name: 'Box', width: 100, height: 40, mystery: true }]
}

describe('pen document fields', () => {
  test('keeps comments, shaders, lint dismissals, and unknown keys', () => {
    const parsed = v.safeParse(
      v.pipe(v.string(), v.parseJson(), penDocumentSchema),
      JSON.stringify(document)
    )
    if (!parsed.success) throw new Error(v.summarize(parsed.issues))

    expect(parsed.output.vendor).toEqual({ keep: true })
    expect(parsed.output.comments?.thread).toEqual(document.comments.thread)
    expect(parsed.output.shaders?.rect).toEqual(document.shaders.rect)
    expect(parsed.output.lintDismissals?.['rect:contrast']).toBe(true)
    expect(parsed.output.lintDismissals?.['rect:spacing']).toEqual({
      dismissed: false,
      note: 'later'
    })
    expect(parsed.output.children[0]?.mystery).toBe(true)
  })

  test('still builds a layer when the new fields are present', () => {
    const graph = parsePenFile(JSON.stringify(document))

    expect(graph.getNode('rect')?.name).toBe('Box')
  })

  test('parses an older fixture that omits the new fields', async () => {
    const doc = parsePenDocument(await Bun.file(`${FIXTURES}/pencil_simple.pen`).text())

    expect(doc.version).toBe('2.8')
    expect(doc.children.length).toBeGreaterThan(0)
    expect(doc.comments).toBeUndefined()
    expect(doc.shaders).toBeUndefined()
    expect(doc.lintDismissals).toBeUndefined()
  })
})

import { describe, expect, test } from 'bun:test'

import { createOperationLog } from '@open-pencil/session'

describe('operation log', () => {
  test('undo and redo walk inverse pairs', () => {
    const log = createOperationLog()
    log.append([{ kind: 'remove-node', id: 'a' }], [{ kind: 'remove-node', id: 'b' }], null)
    expect(log.undo()?.inverse).toEqual([{ kind: 'remove-node', id: 'b' }])
    expect(log.redo()?.forward).toEqual([{ kind: 'remove-node', id: 'a' }])
  })

  test('a coalesced tip keeps its first inverse', () => {
    const log = createOperationLog()
    log.append(
      [{ kind: 'patch-fields', id: 'a', fields: { x: 2 } }],
      [{ kind: 'patch-fields', id: 'a', fields: { x: 1 } }],
      'scrub-x'
    )
    expect(log.tip('scrub-x')?.sequence).toBe(1)
    log.replaceTip([{ kind: 'patch-fields', id: 'a', fields: { x: 9 } }])
    const entry = log.undo()
    expect(entry?.forward).toEqual([{ kind: 'patch-fields', id: 'a', fields: { x: 9 } }])
    expect(entry?.inverse).toEqual([{ kind: 'patch-fields', id: 'a', fields: { x: 1 } }])
  })
})

import { describe, expect, test } from 'bun:test'

import { createInMemorySupervisor } from '@open-pencil/session'

import { createFakeEngine } from './helpers/fake-engine'

describe('in-memory supervisor', () => {
  test('queues documents past the cap and restarts one without dropping the other', async () => {
    const supervisor = createInMemorySupervisor({
      cpuCount: 2,
      factory: { open: createFakeEngine }
    })
    const first = await supervisor.open({ name: 'one', id: 'one' })
    const second = await supervisor.open({ name: 'two', id: 'two' })
    let thirdOpened = false
    const third = supervisor.open({ name: 'three', id: 'three' }).then((id) => {
      thirdOpened = true
      return id
    })
    await Promise.resolve()
    expect(thirdOpened).toBe(false)
    await supervisor.submit(first, { type: 'undo' }, 'interaction')
    await supervisor.submit(second, { type: 'undo' }, 'interaction')
    await supervisor.crash(first)
    expect(
      (await supervisor.layerTree(second, { parentId: null, offset: 0, limit: 10 })).total
    ).toBe(1)
    expect(
      (await supervisor.layerTree(first, { parentId: null, offset: 0, limit: 10 })).total
    ).toBe(1)
    await supervisor.close(second)
    await third
    expect(thirdOpened).toBe(true)
    await supervisor.shutdown()
  })

  test('holds jobs at the job cap', async () => {
    const supervisor = createInMemorySupervisor({
      cpuCount: 2,
      jobCap: 1,
      factory: { open: createFakeEngine }
    })
    const first = await supervisor.enqueue({ documentId: 'one', kind: 'export', payload: null })
    let secondAccepted = false
    const second = supervisor
      .enqueue({ documentId: 'one', kind: 'export', payload: null })
      .then((ack) => {
        secondAccepted = true
        return ack
      })
    await Promise.resolve()
    expect(secondAccepted).toBe(false)
    supervisor.completeJob(first.id)
    const ack = await second
    expect(ack.accepted).toBe(true)
    expect(secondAccepted).toBe(true)
  })
})

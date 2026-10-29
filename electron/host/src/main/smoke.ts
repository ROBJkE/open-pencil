import { app } from 'electron'

import { forkDocumentRuntime } from '../document/fork'
import { createUtilitySupervisor } from '../document/supervisor'
import { workerPath } from './paths'

/** Headless check that a real utility process restarts from its checkpoint. */
export async function runDocumentSmoke(): Promise<void> {
  try {
    await app.whenReady()
    const supervisor = createUtilitySupervisor({
      cpuCount: 2,
      factory: { spawn: () => forkDocumentRuntime(workerPath()) }
    })
    const id = await supervisor.open({ name: 'Smoke', id: 'smoke' })
    const created = await supervisor.submit(
      id,
      {
        type: 'create',
        parentId: null,
        index: 0,
        node: { id: 'frame', type: 'frame', fields: { name: 'Frame' } }
      },
      'interaction'
    )
    if (!created.ack.accepted) throw new Error(created.ack.reason ?? 'create failed')
    await supervisor.crash(id)
    const restored = await supervisor.layerTree(id, { parentId: null, offset: 0, limit: 10 })
    const other = await supervisor.open({ name: 'Other', id: 'other' })
    const empty = await supervisor.layerTree(other, { parentId: null, offset: 0, limit: 10 })
    await supervisor.shutdown()
    if (restored.rows[0]?.name !== 'Frame' || empty.total !== 0) {
      throw new Error('utility process did not restart from its checkpoint')
    }
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
}

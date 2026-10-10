import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DesktopSession } from '#cli/desktop-session/session'

describe('desktop editor session', () => {
  test('creates a layer, saves a .fig file, and opens it again', async () => {
    const session = await DesktopSession.create()
    const created = await session.handleLine(
      JSON.stringify({ id: 1, method: 'createShape', type: 'RECTANGLE' })
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.result.dirty).toBe(true)
    expect(created.result.nodes.some((node) => node.type === 'RECTANGLE')).toBe(true)
    expect(created.result.canUndo).toBe(true)

    const dir = await mkdtemp(join(tmpdir(), 'open-pencil-desktop-'))
    const path = join(dir, 'board.fig')
    const saved = await session.handleLine(JSON.stringify({ id: 2, method: 'saveAs', path }))
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.result.dirty).toBe(false)
    expect(saved.result.path).toBe(path)
    const bytes = await readFile(path)
    expect(bytes.byteLength).toBeGreaterThan(32)

    const reopened = await DesktopSession.create()
    const opened = await reopened.handleLine(JSON.stringify({ id: 3, method: 'open', path }))
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.result.nodes.some((node) => node.type === 'RECTANGLE')).toBe(true)
    expect(opened.result.dirty).toBe(false)
  }, 120_000)

  test('undo removes a created layer', async () => {
    const session = await DesktopSession.create()
    await session.handleLine(JSON.stringify({ id: 1, method: 'createShape', type: 'ELLIPSE' }))
    const undone = await session.handleLine(JSON.stringify({ id: 2, method: 'undo' }))
    expect(undone.ok).toBe(true)
    if (!undone.ok) return
    expect(undone.result.nodes.some((node) => node.type === 'ELLIPSE')).toBe(false)
    expect(undone.result.canRedo).toBe(true)
  }, 60_000)
})

import { describe, expect, test } from 'bun:test'

describe('session boundaries', () => {
  test('session source does not import Electron, Vue, CanvasKit, or Yoga', async () => {
    const files = await Array.fromAsync(
      new Bun.Glob('electron/session/src/**/*.ts').scan({ cwd: process.cwd() })
    )
    const forbidden = /from ['"](?:electron|vue|canvaskit-wasm|yoga-layout)['"]/u
    const hits = await Promise.all(
      files.map(async (file) => ({ file, text: await Bun.file(file).text() }))
    )
    expect(files.length).toBeGreaterThan(0)
    expect(hits.filter((hit) => forbidden.test(hit.text)).map((hit) => hit.file)).toEqual([])
  })
})

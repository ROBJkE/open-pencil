import { existsSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

function entryDir(): string {
  const entry = process.argv[1]
  if (!entry) return process.cwd()
  if (entry.endsWith('.js') || entry.endsWith('.cjs') || entry.endsWith('.mjs')) {
    return dirname(entry)
  }
  return entry
}

export function bundledPath(name: string): string {
  return resolve(entryDir(), name)
}

/** Utility-process scripts unpacked from the asar, falling back to the bundle path. */
export function workerPath(): string {
  const packed = bundledPath('worker.cjs')
  const unpacked = packed.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
  if (unpacked !== packed && existsSync(unpacked)) return unpacked
  return packed
}

export function editorHTMLPath(): string | null {
  const built = resolve(entryDir(), 'ui/index.html')
  return existsSync(built) ? built : null
}

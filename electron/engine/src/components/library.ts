import { posix, win32 } from 'node:path'

/**
 * A library import. `relative` is the path stored on the document. `absolute` is
 * used only when that path is missing or is not a relative file path.
 */
export interface LibraryEntry {
  relative?: string
  absolute?: string
}

interface ClassifiedPath {
  kind: 'relative' | 'absolute'
  path: string
}

/**
 * The file path to open for a library import.
 * A relative path wins. An absolute path is the fallback. URLs are not library paths.
 */
export function resolveLibrary(entry: LibraryEntry): string | null {
  const relative = classify(entry.relative)
  if (relative?.kind === 'relative') return relative.path
  const absolute = classify(entry.absolute)
  if (absolute?.kind === 'absolute') return absolute.path
  if (relative?.kind === 'absolute') return relative.path
  return null
}

function classify(value: string | undefined): ClassifiedPath | null {
  if (value === undefined) return null
  const path = value.trim()
  if (path.length === 0 || isURL(path)) return null
  if (isFileAbsolute(path)) return { kind: 'absolute', path }
  return { kind: 'relative', path }
}

function isFileAbsolute(path: string): boolean {
  return posix.isAbsolute(path) || win32.isAbsolute(path)
}

/**
 * `C:\…` parses as a URL with a one-letter protocol. That is a drive path, not a URL.
 * A leading `//` is a protocol-relative URL, which is not a file path.
 */
function isURL(path: string): boolean {
  if (path.startsWith('//')) return true
  if (!URL.canParse(path)) return false
  return !/^[a-zA-Z]:$/.test(new URL(path).protocol)
}

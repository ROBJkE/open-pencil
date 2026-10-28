import { basename, dirname, join } from 'node:path'

import { nodeFileSystem, type DurableFileSystem } from './files'

const UNSUPPORTED_SYNC_CODES = new Set(['ENOTSUP', 'EOPNOTSUPP', 'EINVAL', 'ENOSYS'])

/**
 * Writes `bytes` to a temporary file in the same directory as `path`, syncs it when the
 * platform can, then renames it over `path`. A crash or a thrown write before the rename
 * leaves the previous file in place.
 */
export async function saveAtomic(
  path: string,
  bytes: Uint8Array,
  filesystem: DurableFileSystem = nodeFileSystem
): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${crypto.randomUUID()}.tmp`)
  try {
    await filesystem.writeFile(temporary, bytes)
    await syncIfSupported(filesystem, temporary)
    await filesystem.rename(temporary, path)
  } catch (error) {
    await removeQuietly(filesystem, temporary)
    throw error
  }
}

async function syncIfSupported(filesystem: DurableFileSystem, path: string): Promise<void> {
  try {
    await filesystem.sync(path)
  } catch (error) {
    const code = errorCode(error)
    if (code !== null && UNSUPPORTED_SYNC_CODES.has(code)) return
    throw error
  }
}

async function removeQuietly(filesystem: DurableFileSystem, path: string): Promise<void> {
  try {
    await filesystem.remove(path)
    // oxlint-disable-next-line open-pencil/no-silent-catch -- A missing temporary file must not replace the failed save.
  } catch {
    // The failed save stays the error the caller sees.
  }
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof Error) || !('code' in error)) return null
  return typeof error.code === 'string' ? error.code : null
}

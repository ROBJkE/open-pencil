import {
  mkdir as makeDirectory,
  open,
  readFile as readBytes,
  rename as renamePath,
  rm,
  writeFile as writeBytes
} from 'node:fs/promises'

/** Files the atomic saver and the recovery store call. Tests pass a fake. */
export interface DurableFileSystem {
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  rename(from: string, to: string): Promise<void>
  /**
   * Flushes `path`. Reject with code `ENOTSUP`, `EOPNOTSUPP`, `EINVAL`, or `ENOSYS`
   * when the platform cannot sync; other failures must leave the destination untouched.
   */
  sync(path: string): Promise<void>
  remove(path: string): Promise<void>
  mkdir(path: string): Promise<void>
}

/** Names of the files `createRecoveryStore` writes inside a recovery directory. */
export const RECOVERY_FILES = {
  snapshot: 'snapshot.json',
  log: 'log.json',
  document: 'document.json',
  recent: 'recent-files.json'
} as const

export const nodeFileSystem: DurableFileSystem = {
  async readFile(path) {
    return new Uint8Array(await readBytes(path))
  },
  async writeFile(path, bytes) {
    await writeBytes(path, bytes)
  },
  async rename(from, to) {
    await renamePath(from, to)
  },
  async sync(path) {
    const handle = await open(path, 'r+')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  },
  async remove(path) {
    await rm(path, { force: true })
  },
  async mkdir(path) {
    await makeDirectory(path, { recursive: true })
  }
}

export async function readOptional(
  filesystem: DurableFileSystem,
  path: string
): Promise<Uint8Array | null> {
  try {
    return await filesystem.readFile(path)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

import { join } from 'node:path'

import * as v from 'valibot'

import { saveAtomic } from './atomic'
import { RecoveryError } from './error'
import { RECOVERY_FILES, readOptional, type DurableFileSystem } from './files'
import { encodeJSON } from './json'

/** How many recent files are kept, newest first. */
export const RECENT_FILE_LIMIT = 10

export interface RecentFile {
  path: string
  name: string
}

const recentFileSchema = v.object({
  path: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1))
})

const recentFilesSchema = v.array(recentFileSchema)

export interface RecentFiles {
  list(): Promise<RecentFile[]>
  remember(file: RecentFile): Promise<RecentFile[]>
}

export function createRecentFiles(dir: string, filesystem: DurableFileSystem): RecentFiles {
  const filePath = join(dir, RECOVERY_FILES.recent)

  return {
    async list() {
      const bytes = await readOptional(filesystem, filePath)
      if (!bytes) return []
      const text = new TextDecoder().decode(bytes)
      const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), recentFilesSchema), text)
      return parsed.success ? parsed.output : []
    },
    async remember(file) {
      const parsed = v.safeParse(recentFileSchema, file)
      if (!parsed.success) {
        throw new RecoveryError(`Recent file is invalid: ${v.summarize(parsed.issues)}`)
      }
      await filesystem.mkdir(dir)
      const next = placeRecent(await this.list(), parsed.output)
      await saveAtomic(filePath, encodeJSON(next), filesystem)
      return next
    }
  }
}

function placeRecent(files: readonly RecentFile[], file: RecentFile): RecentFile[] {
  const next = [file]
  for (const entry of files) {
    if (entry.path !== file.path && next.length < RECENT_FILE_LIMIT) next.push(entry)
  }
  return next
}

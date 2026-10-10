import { watchBrowserFile } from '@/app/document/io/watch-targets'

type FileWatchOptions = {
  getFilePath: () => string | null
  getFileHandle: () => FileSystemFileHandle | null
  getLastWriteTime: () => number
  reloadFromDisk: () => void
}

export function createFileWatcher({
  getFileHandle,
  getLastWriteTime,
  reloadFromDisk
}: FileWatchOptions) {
  let unwatchFile: (() => void) | null = null

  function stopWatchingFile() {
    if (unwatchFile) {
      unwatchFile()
      unwatchFile = null
    }
  }

  async function startWatchingFile() {
    stopWatchingFile()
    const fileHandle = getFileHandle()

    if (fileHandle) {
      unwatchFile = await watchBrowserFile(
        fileHandle,
        getFileHandle,
        getLastWriteTime,
        reloadFromDisk,
        stopWatchingFile
      )
    }
  }

  return { startWatchingFile, stopWatchingFile }
}

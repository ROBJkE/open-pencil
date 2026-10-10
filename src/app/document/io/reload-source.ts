import { readFigFile } from '@open-pencil/core/io/formats/fig'

export type ReloadSourceOptions = {
  documentName: string
  filePath: string | null
  fileHandle: FileSystemFileHandle | null
  signal?: AbortSignal
}

export async function readReloadSource({ fileHandle, signal }: ReloadSourceOptions) {
  signal?.throwIfAborted()
  if (fileHandle) {
    const file = await fileHandle.getFile()
    signal?.throwIfAborted()
    return readFigFile(file, { populate: 'first-page', signal })
  }

  return null
}

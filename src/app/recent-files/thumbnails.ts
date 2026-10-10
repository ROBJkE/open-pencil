const RECENT_FILE_THUMBNAIL_CACHE_DIR = 'recent-file-thumbnails/v2'

export async function loadCachedRecentFileThumbnail(_path: string): Promise<Uint8Array | null> {
  return null
}

export async function cacheRecentFileThumbnail(_path: string, _bytes: Uint8Array): Promise<void> {}

export function clearRecentFileThumbnails(): Promise<void> {
  return Promise.resolve()
}

export async function loadRecentFileThumbnail(path: string): Promise<Uint8Array | null> {
  if (!path.toLowerCase().endsWith('.fig')) return null
  return null
}

export { RECENT_FILE_THUMBNAIL_CACHE_DIR }

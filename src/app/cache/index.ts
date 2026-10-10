import * as v from 'valibot'

const STORAGE_PREFIX = 'open-pencil:cache:v1:'

function isStorageAvailable() {
  return 'window' in globalThis && !!window.localStorage
}

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`
}

function removeStorageEntriesWithPrefix(prefix: string): void {
  if (!isStorageAvailable()) return
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i)
    if (key?.startsWith(storageKey(prefix))) window.localStorage.removeItem(key)
  }
}

export async function readCacheText(key: string): Promise<string | null> {
  if (!isStorageAvailable()) return null
  return window.localStorage.getItem(storageKey(key))
}

export async function writeCacheText(key: string, value: string): Promise<void> {
  if (!isStorageAvailable()) return
  window.localStorage.setItem(storageKey(key), value)
}

export async function removeCacheEntry(key: string): Promise<void> {
  if (!isStorageAvailable()) return
  window.localStorage.removeItem(storageKey(key))
}

export async function readCacheBytes(_key: string): Promise<ArrayBuffer | null> {
  return null
}

export async function writeCacheBytes(_key: string, _value: ArrayBuffer): Promise<void> {}

export async function removeCachePrefix(prefix: string): Promise<void> {
  removeStorageEntriesWithPrefix(prefix)
}

const CacheEnvelopeJSON = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({ updatedAt: v.number(), value: v.unknown() })
)

/**
 * Read a JSON value written by `writeCacheJSON`. A missing, expired, malformed or
 * mismatched entry reads as null, so callers refetch instead of trusting stale shapes.
 */
export async function readCacheJSON<TSchema extends v.GenericSchema>(
  key: string,
  schema: TSchema,
  maxAgeMs?: number
): Promise<v.InferOutput<TSchema> | null> {
  const raw = await readCacheText(key)
  if (!raw) return null

  const envelope = v.safeParse(CacheEnvelopeJSON, raw)
  if (!envelope.success) return null
  if (maxAgeMs !== undefined && Date.now() - envelope.output.updatedAt > maxAgeMs) return null
  const value = v.safeParse(schema, envelope.output.value)
  return value.success ? value.output : null
}

export async function writeCacheJSON(key: string, value: unknown): Promise<void> {
  await writeCacheText(key, JSON.stringify({ updatedAt: Date.now(), value }))
}

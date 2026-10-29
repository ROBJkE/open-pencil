import { fromUint8Array, isValid, toUint8Array } from 'js-base64'
import * as v from 'valibot'

const MAX_SECRET_LENGTH = 16 * 1024

const secretAccountSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(256),
  v.regex(/^[\w.:@/-]+$/)
)

const secretFileSchema = v.record(v.string(), v.string())

export const SECRET_ERRORS = [
  'encryption-unavailable',
  'invalid-account',
  'invalid-value',
  'failed'
] as const

export type SecretError = (typeof SECRET_ERRORS)[number]

export type SecretRead = { ok: true; value: string | null } | { ok: false; error: SecretError }

export type SecretWrite = { ok: true } | { ok: false; error: SecretError }

export interface SecretCipher {
  available(): Promise<boolean>
  encrypt(plain: string): Promise<Uint8Array>
  decrypt(bytes: Uint8Array): Promise<{ secret: string; reencrypt: boolean }>
}

export interface SecretPersistence {
  read(): Promise<Record<string, string>>
  write(data: Record<string, string>): Promise<void>
}

export interface SecretStore {
  read(account: string): Promise<SecretRead>
  write(account: string, secret: string): Promise<SecretWrite>
  remove(account: string): Promise<SecretWrite>
}

function accountError(account: string): SecretError | null {
  const parsed = v.safeParse(secretAccountSchema, account)
  return parsed.success ? null : 'invalid-account'
}

async function encryptionReady(cipher: SecretCipher): Promise<SecretError | null> {
  try {
    const available = await cipher.available()
    return available ? null : 'encryption-unavailable'
  } catch {
    return 'failed'
  }
}

/**
 * Stores ciphertext only. When the OS cipher is unavailable the write is
 * refused and nothing is persisted, plaintext included.
 */
export function createSecretStore(
  cipher: SecretCipher,
  persistence: SecretPersistence
): SecretStore {
  async function load(): Promise<Record<string, string> | SecretError> {
    try {
      return await persistence.read()
    } catch {
      return 'failed'
    }
  }

  return {
    async read(account) {
      const invalid = accountError(account)
      if (invalid) return { ok: false, error: invalid }
      const blocked = await encryptionReady(cipher)
      if (blocked) return { ok: false, error: blocked }
      const stored = await load()
      if (typeof stored === 'string') return { ok: false, error: stored }
      if (!Object.hasOwn(stored, account)) return { ok: true, value: null }
      const encoded = stored[account]
      if (!isValid(encoded)) return { ok: false, error: 'failed' }
      try {
        const decrypted = await cipher.decrypt(toUint8Array(encoded))
        if (decrypted.reencrypt) {
          const next = await cipher.encrypt(decrypted.secret)
          stored[account] = fromUint8Array(next)
          await persistence.write(stored)
        }
        return { ok: true, value: decrypted.secret }
      } catch {
        return { ok: false, error: 'failed' }
      }
    },
    async write(account, secret) {
      const invalid = accountError(account)
      if (invalid) return { ok: false, error: invalid }
      if (secret.length === 0 || secret.length > MAX_SECRET_LENGTH) {
        return { ok: false, error: 'invalid-value' }
      }
      const blocked = await encryptionReady(cipher)
      if (blocked) return { ok: false, error: blocked }
      const stored = await load()
      if (typeof stored === 'string') return { ok: false, error: stored }
      let encoded: string
      try {
        encoded = fromUint8Array(await cipher.encrypt(secret))
      } catch {
        return { ok: false, error: 'failed' }
      }
      stored[account] = encoded
      try {
        await persistence.write(stored)
      } catch {
        return { ok: false, error: 'failed' }
      }
      return { ok: true }
    },
    async remove(account) {
      const invalid = accountError(account)
      if (invalid) return { ok: false, error: invalid }
      const stored = await load()
      if (typeof stored === 'string') return { ok: false, error: stored }
      if (!Object.hasOwn(stored, account)) return { ok: true }
      const next: Record<string, string> = {}
      for (const [key, value] of Object.entries(stored)) {
        if (key !== account) next[key] = value
      }
      try {
        await persistence.write(next)
      } catch {
        return { ok: false, error: 'failed' }
      }
      return { ok: true }
    }
  }
}

export function parseSecretFile(text: string): Record<string, string> {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), secretFileSchema), text)
  if (!parsed.success) throw new Error('secret store is unreadable')
  return parsed.output
}

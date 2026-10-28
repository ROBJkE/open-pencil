import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { safeStorage } from 'electron'

import { createSecretStore, parseSecretFile, type SecretCipher, type SecretStore } from './secrets'

const OS_BACKENDS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'])

/**
 * Electron's `basic_text` backend keeps the key in a plaintext file. That is
 * not the OS credential store, so it counts as encryption being unavailable.
 */
function electronCipher(): SecretCipher {
  return {
    async available() {
      const ready = await safeStorage.isAsyncEncryptionAvailable()
      if (!ready) return false
      if (process.platform !== 'linux') return true
      return OS_BACKENDS.has(safeStorage.getSelectedStorageBackend())
    },
    async encrypt(plain) {
      const encrypted = await safeStorage.encryptStringAsync(plain)
      return new Uint8Array(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength)
    },
    async decrypt(bytes) {
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(bytes))
      return { secret: decrypted.result, reencrypt: decrypted.shouldReEncrypt }
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function filePersistence(file: string) {
  return {
    async read() {
      try {
        const text = await readFile(file, 'utf8')
        return parseSecretFile(text)
      } catch (error) {
        if (isMissingFile(error)) return {}
        throw error
      }
    },
    async write(data: Record<string, string>) {
      await mkdir(dirname(file), { recursive: true })
      const temp = `${file}.${crypto.randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
      await rename(temp, file)
    }
  }
}

export function createElectronSecretStore(userData: string): SecretStore {
  return createSecretStore(electronCipher(), filePersistence(join(userData, 'secrets.json')))
}

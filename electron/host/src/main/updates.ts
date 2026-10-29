import electronUpdater, { type UpdateInfo } from 'electron-updater'

const { autoUpdater } = electronUpdater

export interface UpdateClient {
  check(): Promise<string | null>
  download(): Promise<void>
  install(): void
}

function skipSignatureCheck(): void {
  Reflect.set(autoUpdater, 'verifyUpdateCodeSignature', () => Promise.resolve(null))
}

/** Unsigned Windows and Linux builds. A null verifier accepts the downloaded file. */
export function createElectronUpdateClient(): UpdateClient {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  skipSignatureCheck()

  return {
    check() {
      return new Promise((resolve, reject) => {
        let settled = false
        const finish = (version: string | null) => {
          if (settled) return
          settled = true
          cleanup()
          resolve(version)
        }
        const fail = (error: unknown) => {
          if (settled) return
          settled = true
          cleanup()
          reject(error instanceof Error ? error : new Error('update check failed'))
        }
        const onAvailable = (info: UpdateInfo) => {
          finish(info.version)
        }
        const onNone = () => {
          finish(null)
        }
        const onError = (error: Error) => {
          fail(error)
        }
        const cleanup = () => {
          autoUpdater.off('update-available', onAvailable)
          autoUpdater.off('update-not-available', onNone)
          autoUpdater.off('error', onError)
        }
        autoUpdater.once('update-available', onAvailable)
        autoUpdater.once('update-not-available', onNone)
        autoUpdater.once('error', onError)
        void autoUpdater.checkForUpdates().catch(fail)
      })
    },
    async download() {
      await autoUpdater.downloadUpdate()
    },
    install() {
      autoUpdater.quitAndInstall(false, true)
    }
  }
}

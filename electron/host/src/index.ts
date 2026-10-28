import { createDocumentEngine } from '@open-pencil/engine'
import { createLocalSession, type LocalSession, type OpenDocumentSpec } from '@open-pencil/session'

export interface ElectronHost {
  readonly kind: 'electron'
  session: LocalSession
  openDocument(spec: OpenDocumentSpec): Promise<string>
}

/**
 * In-process host used until the Electron main process is wired.
 * The shell replaces the process supervisor; callers keep this function.
 */
export function createElectronHost(cpuCount = 2): ElectronHost {
  const session = createLocalSession({
    cpuCount,
    factory: {
      open: (spec) => createDocumentEngine(spec)
    }
  })
  return {
    kind: 'electron',
    session,
    openDocument: (spec) => session.client.openDocument(spec)
  }
}

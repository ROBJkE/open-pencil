import { app } from 'electron'

import { startElectronApp } from './app'
import { runDocumentSmoke } from './smoke'

const smoke = process.env.OPENPENCIL_DOCUMENT_SMOKE === '1'
if (smoke) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  const data = process.env.OPENPENCIL_SMOKE_DATA
  if (data) app.setPath('userData', data)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else if (smoke) {
  void runDocumentSmoke()
} else {
  void startElectronApp()
}

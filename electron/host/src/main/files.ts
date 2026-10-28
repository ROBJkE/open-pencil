import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

import { dialog, type BrowserWindow } from 'electron'
import * as v from 'valibot'

import type { OpenDocumentSpec } from '@open-pencil/session'

import type { HostEvent } from './host-events'

const recentFilesSchema = v.array(v.string())
const PEN_FILTERS = [{ name: 'OpenPencil', extensions: ['pen'] }]
const RECENT_LIMIT = 10

export interface DocumentFileHost {
  openDocument(spec: OpenDocumentSpec): Promise<string>
  exportBytes(id: string): Promise<Uint8Array>
  closeDocument(id: string): Promise<void>
  getWindow: () => BrowserWindow | null
  userData: string
  send: (event: HostEvent) => void
  onRecent: (paths: readonly string[]) => void
}

interface OpenFile {
  id: string
  name: string
  path: string | null
  dirty: boolean
}

async function readRecent(file: string): Promise<string[]> {
  try {
    const text = await readFile(file, 'utf8')
    const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), recentFilesSchema), text)
    return parsed.success ? parsed.output.slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

async function writeRecent(file: string, paths: readonly string[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${crypto.randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(paths), 'utf8')
  await rename(temp, file)
}

function remember(paths: readonly string[], filePath: string): string[] {
  const next = [filePath]
  for (const entry of paths) {
    if (entry !== filePath && next.length < RECENT_LIMIT) next.push(entry)
  }
  return next
}

export function createDocumentFiles(host: DocumentFileHost) {
  const documents = new Map<string, OpenFile>()
  let activeId: string | null = null
  let recent: string[] = []
  const recentFile = `${host.userData}/recent-files.json`
  const ready = loadRecent()

  async function loadRecent(): Promise<void> {
    recent = await readRecent(recentFile)
    host.onRecent(recent)
  }

  function parentWindow(): BrowserWindow | null {
    const current = host.getWindow()
    return current && !current.isDestroyed() ? current : null
  }

  function activate(id: string): void {
    if (!documents.has(id)) return
    activeId = id
    const record = documents.get(id)
    const title = record ? `${record.name} — OpenPencil` : 'OpenPencil'
    parentWindow()?.setTitle(title)
  }

  async function rememberPath(filePath: string): Promise<void> {
    await ready
    recent = remember(recent, filePath)
    host.onRecent(recent)
    await writeRecent(recentFile, recent)
  }

  async function openBytes(
    name: string,
    bytes: Uint8Array,
    filePath: string | null
  ): Promise<string> {
    if (filePath) {
      for (const record of documents.values()) {
        if (record.path === filePath) {
          activate(record.id)
          return record.id
        }
      }
    }
    const id = await host.openDocument({ name, bytes: bytes.byteLength > 0 ? bytes : undefined })
    documents.set(id, { id, name, path: filePath, dirty: false })
    activate(id)
    host.send({ type: 'document-opened', id, name, path: filePath })
    if (filePath) await rememberPath(filePath)
    return id
  }

  async function writeDocument(id: string, filePath: string): Promise<void> {
    const bytes = await host.exportBytes(id)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, bytes)
    const record = documents.get(id)
    if (!record) return
    record.path = filePath
    record.dirty = false
    record.name = basename(filePath)
    host.send({ type: 'document-saved', id, path: filePath })
    await rememberPath(filePath)
    if (activeId === id) activate(id)
  }

  async function chooseSavePath(name: string): Promise<string | null> {
    const options = {
      title: 'Save',
      defaultPath: name.endsWith('.pen') ? name : `${name}.pen`,
      filters: PEN_FILTERS
    }
    const parent = parentWindow()
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    return result.filePath.endsWith('.pen') ? result.filePath : `${result.filePath}.pen`
  }

  return {
    activate,
    activeId: () => activeId,
    hasDirty: () => {
      for (const record of documents.values()) if (record.dirty) return true
      return false
    },
    markDirty(id: string) {
      const record = documents.get(id)
      if (record) record.dirty = true
    },
    async openEmpty() {
      return this.openSpec({ name: 'Untitled' })
    },
    async openSpec(spec: OpenDocumentSpec) {
      const id = await host.openDocument(spec)
      documents.set(id, { id, name: spec.name, path: null, dirty: false })
      activate(id)
      host.send({ type: 'document-opened', id, name: spec.name, path: null })
      return id
    },
    async openFromPath(filePath: string) {
      const bytes = new Uint8Array(await readFile(filePath))
      return openBytes(basename(filePath), bytes, filePath)
    },
    async openFromDialog() {
      const options = {
        title: 'Open',
        properties: ['openFile'] as Array<'openFile'>,
        filters: PEN_FILTERS
      }
      const parent = parentWindow()
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      const filePath = result.filePaths[0]
      if (result.canceled || !filePath) return null
      return this.openFromPath(filePath)
    },
    async openRecent(index: number) {
      await ready
      const filePath = recent[index]
      if (!filePath) return null
      return this.openFromPath(filePath)
    },
    async clearRecent() {
      await ready
      recent = []
      host.onRecent(recent)
      await writeRecent(recentFile, recent)
    },
    async save(id = activeId) {
      if (!id) return null
      const record = documents.get(id)
      if (!record) return null
      if (!record.path) return this.saveAs(id)
      await writeDocument(id, record.path)
      return record.path
    },
    async saveAs(id = activeId) {
      if (!id) return null
      const record = documents.get(id)
      if (!record) return null
      const filePath = await chooseSavePath(record.name)
      if (!filePath) return null
      await writeDocument(id, filePath)
      return filePath
    },
    async saveAllDirty() {
      for (const record of documents.values()) {
        if (!record.dirty) continue
        const saved = record.path ? await this.save(record.id) : await this.saveAs(record.id)
        if (!saved) return false
      }
      return true
    },
    async close(id = activeId) {
      if (!id) return
      const record = documents.get(id)
      if (!record) return
      if (record.dirty) {
        const options = {
          type: 'question' as const,
          buttons: ['Save', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
          message: `Save changes to ${record.name}?`
        }
        const parent = parentWindow()
        const choice = parent
          ? await dialog.showMessageBox(parent, options)
          : await dialog.showMessageBox(options)
        if (choice.response !== 0) return
        const saved = await this.save(id)
        if (!saved) return
      }
      await host.closeDocument(id)
      documents.delete(id)
      if (activeId === id) {
        activeId = null
        parentWindow()?.setTitle('OpenPencil')
      }
      host.send({ type: 'document-closed', id })
    }
  }
}

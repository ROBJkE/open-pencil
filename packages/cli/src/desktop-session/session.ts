import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

import { createEditor, type Editor } from '@open-pencil/core/editor'
import {
  BUILTIN_IO_FORMATS,
  computeContentBounds,
  headlessRenderNodes,
  IORegistry
} from '@open-pencil/core/io'
import { populateFigPage } from '@open-pencil/core/io/formats/fig'
import { computeAllLayouts } from '@open-pencil/core/layout'
import { SceneGraph } from '@open-pencil/scene-graph'
import { fromUint8Array } from 'js-base64'
import * as v from 'valibot'

const io = new IORegistry(BUILTIN_IO_FORMATS)
const MAX_LAYERS = 400
const MAX_PREVIEW_EDGE = 1400
const SHAPE_TYPES = ['RECTANGLE', 'ELLIPSE', 'FRAME', 'TEXT'] as const

const RequestSchema = v.object({
  id: v.pipe(v.number(), v.integer()),
  method: v.picklist([
    'new',
    'open',
    'save',
    'saveAs',
    'undo',
    'redo',
    'select',
    'hit',
    'switchPage',
    'createShape',
    'deleteSelection',
    'setZoom',
    'zoomFit',
    'snapshot'
  ]),
  path: v.optional(v.string()),
  ids: v.optional(v.array(v.string())),
  pageId: v.optional(v.string()),
  type: v.optional(v.picklist(SHAPE_TYPES)),
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  zoom: v.optional(v.number())
})

type SessionRequest = v.InferOutput<typeof RequestSchema>

export interface SessionLayer {
  id: string
  name: string
  type: string
  depth: number
  selected: boolean
}

export interface SessionSnapshot {
  title: string
  path: string | null
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  pageId: string
  pages: Array<{ id: string; name: string }>
  nodes: SessionLayer[]
  zoom: number
  pngBase64: string | null
  view: {
    minX: number
    minY: number
    width: number
    height: number
    pixelWidth: number
    pixelHeight: number
  } | null
  previewError: string | null
  status: string
}

type SessionResponse =
  | { id: number; ok: true; result: SessionSnapshot }
  | { id: number; ok: false; error: string }

/**
 * One open document in the desktop window.
 *
 * The Iced shell speaks newline JSON to {@link serve}. Every mutation goes
 * through `createEditor` from `@open-pencil/core/editor`, and bytes go through
 * `@open-pencil/core/io`.
 */
export class DesktopSession {
  private readonly editor: Editor
  private path: string | null = null
  private dirty = false
  private zoom = 1
  private status = 'New document'

  private constructor(editor: Editor) {
    this.editor = editor
  }

  static async create(): Promise<DesktopSession> {
    const session = new DesktopSession(createEditor())
    await session.reset(new SceneGraph(), null, 'New document')
    return session
  }

  async handleLine(line: string): Promise<SessionResponse> {
    const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), RequestSchema), line)
    if (!parsed.success) {
      return { id: 0, ok: false, error: 'Invalid session request' }
    }
    try {
      const result = await this.dispatch(parsed.output)
      return { id: parsed.output.id, ok: true, result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { id: parsed.output.id, ok: false, error: message }
    }
  }

  private async dispatch(request: SessionRequest): Promise<SessionSnapshot> {
    switch (request.method) {
      case 'new':
        await this.reset(new SceneGraph(), null, 'New document')
        break
      case 'open':
        await this.open(required(request.path, 'path'))
        break
      case 'save':
        await this.save()
        break
      case 'saveAs':
        await this.saveAs(required(request.path, 'path'))
        break
      case 'undo':
        this.editor.undoAction()
        this.dirty = true
        this.status = 'Undo'
        break
      case 'redo':
        this.editor.redoAction()
        this.dirty = true
        this.status = 'Redo'
        break
      case 'select':
        this.editor.select(request.ids ?? [])
        this.status = 'Selection'
        break
      case 'hit':
        this.hit(requiredNumber(request.x, 'x'), requiredNumber(request.y, 'y'))
        break
      case 'switchPage':
        await this.editor.switchPage(required(request.pageId, 'pageId'))
        this.status = 'Page'
        break
      case 'createShape':
        this.createShape(requiredShape(request.type))
        break
      case 'deleteSelection':
        this.editor.deleteSelected()
        this.dirty = true
        this.status = 'Delete'
        break
      case 'setZoom':
        this.zoom = clampZoom(requiredNumber(request.zoom, 'zoom'))
        this.status = 'Zoom'
        break
      case 'zoomFit':
        this.zoom = this.fitZoom()
        this.status = 'Zoom to fit'
        break
      case 'snapshot':
        break
      default:
        break
    }
    return this.snapshot()
  }

  private async reset(graph: SceneGraph, path: string | null, status: string): Promise<void> {
    const pageId = graph.getPages()[0]?.id
    if (pageId) {
      populateFigPage(graph, pageId)
      computeAllLayouts(graph, pageId)
    }
    this.editor.replaceGraph(graph)
    this.editor.undo.clear()
    this.path = path
    this.dirty = false
    this.status = status
  }

  private async open(path: string): Promise<void> {
    const bytes = new Uint8Array(await readFile(path))
    const { graph } = await io.readDocument({ name: path, data: bytes })
    await this.reset(graph, path, `Opened ${basename(path)}`)
  }

  private async save(): Promise<void> {
    if (!this.path) throw new Error('This document has no file yet')
    if (!this.path.toLowerCase().endsWith('.fig')) {
      throw new Error('Save this document as a .fig file')
    }
    await this.writeFig(this.path)
    this.dirty = false
    this.status = `Saved ${basename(this.path)}`
  }

  private async saveAs(path: string): Promise<void> {
    const target = path.toLowerCase().endsWith('.fig') ? path : `${path}.fig`
    await this.writeFig(target)
    this.path = target
    this.dirty = false
    this.status = `Saved ${basename(target)}`
  }

  private async writeFig(path: string): Promise<void> {
    const result = await io.writeDocument('fig', this.editor.graph)
    if (typeof result.data === 'string') throw new Error('Document writer returned text, not a .fig file')
    await writeFile(path, result.data)
  }

  private hit(x: number, y: number): void {
    const hit = this.editor.graph.hitTest(x, y, this.editor.state.currentPageId)
    if (hit) this.editor.select([hit.id])
    else this.editor.clearSelection()
    this.status = hit ? `Selected ${hit.name}` : 'Selection cleared'
  }

  private createShape(type: (typeof SHAPE_TYPES)[number]): void {
    const pageId = this.editor.state.currentPageId
    const count = this.editor.graph.getChildren(pageId).length
    const x = 80 + (count % 8) * 24
    const y = 80 + (count % 5) * 24
    const width = type === 'TEXT' ? 160 : 140
    const height = type === 'TEXT' ? 32 : 90
    const id = this.editor.createShape(type, x, y, width, height)
    this.editor.select([id])
    this.dirty = true
    this.status = `Created ${type.toLowerCase()}`
  }

  private fitZoom(): number {
    const bounds = this.contentBounds()
    if (!bounds) return 1
    const longest = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1)
    return clampZoom(900 / longest)
  }

  private contentBounds() {
    const pageId = this.editor.state.currentPageId
    populateFigPage(this.editor.graph, pageId)
    computeAllLayouts(this.editor.graph, pageId)
    const ids = this.editor.graph.getChildren(pageId).map((node) => node.id)
    if (ids.length === 0) return null
    return computeContentBounds(this.editor.graph, ids)
  }

  private async snapshot(): Promise<SessionSnapshot> {
    const pageId = this.editor.state.currentPageId
    const pages = this.editor.graph.getPages().map((page) => ({ id: page.id, name: page.name }))
    const nodes: SessionLayer[] = []
    collectLayers(this.editor, pageId, 0, nodes)
    const bounds = this.contentBounds()
    let pngBase64: string | null = null
    let view: SessionSnapshot['view'] = null
    let previewError: string | null = null
    if (bounds) {
      const width = Math.max(bounds.maxX - bounds.minX, 1)
      const height = Math.max(bounds.maxY - bounds.minY, 1)
      const scale = previewScale(width, height, this.zoom)
      try {
        const ids = this.editor.graph.getChildren(pageId).map((node) => node.id)
        const png = await headlessRenderNodes(this.editor.graph, pageId, ids, {
          scale,
          format: 'PNG'
        })
        if (png && png.length > 0) {
          pngBase64 = fromUint8Array(png)
          view = {
            minX: bounds.minX,
            minY: bounds.minY,
            width,
            height,
            pixelWidth: Math.max(1, Math.round(width * scale)),
            pixelHeight: Math.max(1, Math.round(height * scale))
          }
        } else {
          previewError = 'The page did not render'
        }
      } catch (error) {
        previewError = error instanceof Error ? error.message : String(error)
      }
    }
    const title = this.path ? basename(this.path, extname(this.path)) : 'Untitled'
    return {
      title,
      path: this.path,
      dirty: this.dirty,
      canUndo: this.editor.undo.canUndo,
      canRedo: this.editor.undo.canRedo,
      pageId,
      pages,
      nodes,
      zoom: this.zoom,
      pngBase64,
      view,
      previewError,
      status: this.status
    }
  }
}

function collectLayers(editor: Editor, parentId: string, depth: number, out: SessionLayer[]): void {
  for (const child of editor.graph.getChildren(parentId)) {
    if (out.length >= MAX_LAYERS) return
    out.push({
      id: child.id,
      name: child.name || child.type,
      type: child.type,
      depth,
      selected: editor.state.selectedIds.has(child.id)
    })
    collectLayers(editor, child.id, depth + 1, out)
  }
}

function previewScale(width: number, height: number, zoom: number): number {
  const longest = Math.max(width, height, 1)
  let scale = Math.min(clampZoom(zoom), MAX_PREVIEW_EDGE / longest)
  const pixels = width * scale * height * scale
  const budget = MAX_PREVIEW_EDGE * MAX_PREVIEW_EDGE
  if (pixels > budget) scale *= Math.sqrt(budget / pixels)
  return Math.max(scale, 0.05)
}

function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(8, Math.max(0.1, zoom))
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function requiredNumber(value: number | undefined, name: string): number {
  if (value === undefined || !Number.isFinite(value)) throw new Error(`Missing ${name}`)
  return value
}

function requiredShape(value: (typeof SHAPE_TYPES)[number] | undefined): (typeof SHAPE_TYPES)[number] {
  if (!value) throw new Error('Missing type')
  return value
}

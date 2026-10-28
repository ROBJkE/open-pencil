import { inject, type ComputedRef, type InjectionKey, type ShallowRef } from 'vue'

import type { CanvasTool, SelectionProperties, ViewportSummary } from '@open-pencil/session'

import type { OpenPencilBridge } from '../session/bridge'
import type { ShellTheme } from '../session/theme'
import type { useDocumentView } from './useDocumentView'

export interface DocumentView {
  selection: ShallowRef<SelectionProperties>
  viewport: ShallowRef<ViewportSummary>
  layerTotal: ShallowRef<number>
  pageCount: ShallowRef<number>
  ready: ShallowRef<boolean>
  refresh: ReturnType<typeof useDocumentView>['refresh']
}

export const DOCUMENT_KEY: InjectionKey<ComputedRef<string>> = Symbol('openpencil-document')
export const VIEW_KEY: InjectionKey<DocumentView> = Symbol('openpencil-view')
export const REVISION_KEY: InjectionKey<ComputedRef<number>> = Symbol('openpencil-revision')
export const BUMP_KEY: InjectionKey<() => void> = Symbol('openpencil-bump')

export interface ShellActions {
  newTab: () => void
  closeTab: () => void
  openFile: () => void
  saveFile: () => void
  openSettings: () => void
  undo: () => void
  redo: () => void
  zoomIn: () => void
  zoomOut: () => void
  setTheme: (theme: ShellTheme) => void
  removeSelection: () => void
  select: (id: string) => void
  expand: (id: string, expanded: boolean) => void
  removeNode: (id: string) => void
  addPage: () => void
  setTool: (tool: CanvasTool) => void
}

export const WINDOW_KEY: InjectionKey<OpenPencilBridge> = Symbol('openpencil-window')
export const ACTIONS_KEY: InjectionKey<ShellActions> = Symbol('openpencil-actions')
export const TOOL_KEY: InjectionKey<ComputedRef<CanvasTool>> = Symbol('openpencil-tool')
export const THEME_KEY: InjectionKey<ComputedRef<ShellTheme>> = Symbol('openpencil-theme')

export function useDocumentId(): ComputedRef<string> {
  const id = inject(DOCUMENT_KEY)
  if (!id) throw new Error('document id is required')
  return id
}

export function useDocumentProjection(): DocumentView {
  const view = inject(VIEW_KEY)
  if (!view) throw new Error('document view is required')
  return view
}

export function useRevision(): ComputedRef<number> {
  const revision = inject(REVISION_KEY)
  if (!revision) throw new Error('revision is required')
  return revision
}

export function useBump(): () => void {
  const bump = inject(BUMP_KEY)
  if (!bump) throw new Error('revision bump is required')
  return bump
}

export function useWindowBridge(): OpenPencilBridge {
  const bridge = inject(WINDOW_KEY)
  if (!bridge) throw new Error('window bridge is required')
  return bridge
}

export function useShellActions(): ShellActions {
  const actions = inject(ACTIONS_KEY)
  if (!actions) throw new Error('shell actions are required')
  return actions
}

export function useActiveTool(): ComputedRef<CanvasTool> {
  const tool = inject(TOOL_KEY)
  if (!tool) throw new Error('active tool is required')
  return tool
}

export function useShellTheme(): ComputedRef<ShellTheme> {
  const theme = inject(THEME_KEY)
  if (!theme) throw new Error('shell theme is required')
  return theme
}

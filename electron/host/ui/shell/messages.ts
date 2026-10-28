import type { CanvasTool } from '@open-pencil/session'

export const messages = {
  pages: 'Pages',
  layers: 'Layers',
  assets: 'Assets',
  file: 'File',
  design: 'Design',
  code: 'Code',
  ai: 'AI',
  lint: 'Lint',
  toolbar: 'Toolbar',
  on: 'On',
  off: 'Off',
  accent: 'Accent',
  settings: 'Settings',
  settingsDescription: 'Preferences for this window.',
  done: 'Done',
  close: 'Close',
  dark: 'Dark',
  light: 'Light',
  appearance: 'Appearance',
  theme: 'Theme',
  newTab: 'New',
  closeTab: 'Close tab',
  open: 'Open…',
  save: 'Save',
  undo: 'Undo',
  redo: 'Redo',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  edit: 'Edit',
  view: 'View',
  object: 'Object',
  select: 'Select',
  delete: 'Delete',
  addPage: 'Add page',
  expandLayer: 'Expand',
  collapseLayer: 'Collapse',
  mixed: 'Mixed',
  position: 'Position',
  layout: 'Layout',
  fill: 'Fill',
  stroke: 'Stroke',
  typography: 'Typography',
  noSelection: 'No selection',
  noLayers: 'No layers',
  noPages: 'No pages',
  noAssets: 'No assets in this file.',
  canvas: 'Canvas',
  codeShell: 'Code export is not available in this window yet.',
  aiShell: 'Chat is not available in this window yet.',
  lintShell: 'Design check is not available in this window yet.',
  provider: 'Provider',
  providerName: 'Provider name',
  apiKey: 'API key',
  apiKeyHint: 'The key stays in this field and is not stored.',
  toolAccess: 'Tool access',
  toolAccessHint: 'Tools the assistant may use from this window.',
  generalHint: 'Theme for this window.',
  toolbarHint: 'The toolbar stays on the canvas.',
  placeholderHint: 'This section is not available in this window yet.',
  fontFamily: 'Font',
  zoom: 'Zoom'
} as const

export const TOOL_LABELS: Record<CanvasTool, string> = {
  select: 'Move',
  frame: 'Frame',
  section: 'Section',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  polygon: 'Polygon',
  star: 'Star',
  text: 'Text',
  pen: 'Pen',
  vector: 'Vector',
  hand: 'Hand',
  zoom: 'Zoom'
}

export const TOOL_SHORTCUTS: Record<CanvasTool, string> = {
  select: 'V',
  frame: 'F',
  section: 'S',
  rectangle: 'R',
  ellipse: 'O',
  line: 'L',
  polygon: '',
  star: '',
  text: 'T',
  pen: 'P',
  vector: '',
  hand: 'H',
  zoom: 'Z'
}

export function toolTip(tool: CanvasTool): string {
  const shortcut = TOOL_SHORTCUTS[tool]
  const label = TOOL_LABELS[tool]
  return shortcut ? `${label} (${shortcut})` : label
}

export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'toolbar', label: 'Toolbar' },
  { id: 'ai', label: 'AI and agents' },
  { id: 'usage', label: 'Usage' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'mcp', label: 'MCP' },
  { id: 'tools', label: 'Tool access' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'media', label: 'Media' },
  { id: 'storage', label: 'Storage' }
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

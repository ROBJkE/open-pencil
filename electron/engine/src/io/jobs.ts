/** Formats named by the export surface that stay queued until a later worker owns them. */
export const QUEUED_EXPORT_KINDS = [
  'pdf',
  'pptx',
  'html',
  'tailwind',
  'storybook',
  'mermaid',
  'draw.io'
] as const

export type QueuedExportKind = (typeof QUEUED_EXPORT_KINDS)[number]

export interface QueuedExport {
  readonly status: 'queued'
  readonly kind: QueuedExportKind
}

/** Names the format and leaves the work queued. No PDF, PPTX, or diagram library runs here. */
export function exportJob(kind: QueuedExportKind): QueuedExport {
  return { status: 'queued', kind }
}

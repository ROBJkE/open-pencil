/**
 * Stateless components copied from src/components/ui.
 * Each was checked for editor-store and scene-graph imports.
 * src/components/ui has no slider; NumberField imports the editor store and was not copied.
 */
export const COPIED_CONTROLS = [
  'AppButton',
  'IconButton',
  'Tip',
  'AppInput',
  'AppShortcutText',
  'MenuScrollArea'
] as const

export type CopiedControl = (typeof COPIED_CONTROLS)[number]

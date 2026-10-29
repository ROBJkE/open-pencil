export const SHELL_THEMES = ['dark', 'light'] as const
export type ShellTheme = (typeof SHELL_THEMES)[number]

export function themeAttributes(theme: ShellTheme): { className: ShellTheme; theme: ShellTheme } {
  return { className: theme, theme }
}

/** Toggles the copied token classes on the document element. */
export function applyShellTheme(theme: ShellTheme, root: HTMLElement = document.documentElement): void {
  const next = themeAttributes(theme)
  root.classList.remove('dark', 'light')
  root.classList.add(next.className)
  root.dataset.theme = next.theme
  root.style.colorScheme = next.theme
}

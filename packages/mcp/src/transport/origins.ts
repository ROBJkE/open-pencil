/**
 * Origins allowed to call the local server from a view when no override is set.
 *
 * The desktop app is a native window and does not call this server from a
 * webview, so the default list is empty. Browsers set `Origin` themselves.
 * Set `OPENPENCIL_MCP_CORS_ORIGIN` to allow a dev server or the web app.
 * Requests still need the bearer token whenever authentication is enabled.
 */
export const DESKTOP_APP_ORIGINS = [] as const

/** Parse a comma-separated override. Returns null when nothing usable is set. */
export function parseCORSOrigins(raw: string | undefined | null): string[] | null {
  if (raw == null) return null
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
  return origins.length > 0 ? origins : null
}

/** Explicit configuration wins; otherwise the desktop app origin is allowed. */
export function resolveCORSOrigins(raw: string | undefined): readonly string[] {
  return parseCORSOrigins(raw) ?? DESKTOP_APP_ORIGINS
}

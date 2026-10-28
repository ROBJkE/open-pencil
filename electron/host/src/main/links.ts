const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const ROOM_ID_LENGTH = 32
const ROOM_ID = /^[a-z0-9]{32}$/
const HEX = /^[0-9a-fA-F]+$/

export type DeepLink =
  | { type: 'open'; file: string; node: string | null }
  | { type: 'join'; room: string }
  | { type: 'oauth'; provider: string; query: string }
  | {
      type: 'cloud'
      kind: 'invitations' | 'share'
      id: string
      server: string
      secret: string
    }

/** Links the editor may hand to the system browser or a mail client. */
export function isAllowedExternalURL(value: string): boolean {
  try {
    const url = new URL(value)
    return EXTERNAL_PROTOCOLS.has(url.protocol)
  } catch {
    return false
  }
}

function isUuid(value: string): boolean {
  if (value.length !== 36) return false
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (index === 8 || index === 13 || index === 18 || index === 23) {
      if (char !== '-') return false
      continue
    }
    if (!HEX.test(char)) return false
  }
  return true
}

function isSecret(value: string): boolean {
  return value.length >= 32 && value.length <= 128 && HEX.test(value)
}

function isAbsoluteFile(file: string): boolean {
  if (file.startsWith('/') || file.startsWith('\\')) return true
  return file.length > 1 && file[1] === ':'
}

function hasDotSegment(file: string): boolean {
  for (const segment of file.split(/[/\\]/)) {
    if (segment === '.' || segment === '..') return true
  }
  return false
}

function parseOpen(url: URL): DeepLink | null {
  const file = url.searchParams.get('file')
  if (!file) return null
  if (isAbsoluteFile(file) || hasDotSegment(file)) return null
  const lower = file.toLowerCase()
  if (!lower.endsWith('.pen') && !lower.endsWith('.fig')) return null
  const node = url.searchParams.get('node')
  return { type: 'open', file, node: node && node.length > 0 ? node : null }
}

function parseJoin(url: URL): DeepLink | null {
  const room = url.searchParams.get('room')
  if (!room || room.length !== ROOM_ID_LENGTH || !ROOM_ID.test(room)) return null
  return { type: 'join', room }
}

function parseOAuth(url: URL): DeepLink | null {
  const provider = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
  if (provider.length === 0 || !/^[a-z]+$/.test(provider)) return null
  const query = url.search
  return { type: 'oauth', provider, query }
}

function parseCloud(url: URL): DeepLink | null {
  if (url.pathname !== '' && url.pathname !== '/') return null
  const linkText = url.searchParams.get('url')
  if (!linkText) return null
  let link: URL
  try {
    link = new URL(linkText)
  } catch {
    return null
  }
  if (link.protocol !== 'http:' && link.protocol !== 'https:') return null
  if (!link.host || link.username || link.password || link.search || link.hash) return null
  const segments = link.pathname.split('/').filter((segment) => segment.length > 0)
  if (segments.length !== 2) return null
  const kindText = segments[0]
  const id = segments[1]
  if (!kindText || !id || !isUuid(id)) return null
  if (kindText !== 'invitations' && kindText !== 'share') return null
  const secret = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  if (!isSecret(secret)) return null
  return { type: 'cloud', kind: kindText, id, server: link.origin, secret }
}

export function launchTargets(argv: readonly string[]): {
  pens: string[]
  figs: string[]
  links: string[]
} {
  const pens: string[] = []
  const figs: string[] = []
  const links: string[] = []
  for (const arg of argv) {
    if (arg.startsWith('openpencil://')) links.push(arg)
    else if (arg.startsWith('-')) continue
    else if (/\.pen$/i.test(arg)) pens.push(arg)
    else if (/\.fig$/i.test(arg)) figs.push(arg)
  }
  return { pens, figs, links }
}

/** `openpencil://` links. Absolute paths and unknown actions are refused. */
export function parseDeepLink(value: string): DeepLink | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'openpencil:') return null
  switch (url.hostname) {
    case 'open':
      return parseOpen(url)
    case 'join':
      return parseJoin(url)
    case 'oauth':
      return parseOAuth(url)
    case 'cloud':
      return parseCloud(url)
    default:
      return null
  }
}

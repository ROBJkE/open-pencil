import { promiseTimeout } from '@vueuse/core'

import { AUTOMATION_HTTP_PORT } from '@open-pencil/core/constants'
import { parseToolDescriptor, type ToolDescriptor } from '@open-pencil/mcp/tools'

import { APP_VERSION } from '@/app/runtime/version'

import { DEV_MCP_RESTART_PATH, type DevMCPConfiguration } from './dev-control'
import { classifySpawnFailure, mcpFailure, MCPStartupError, type MCPFailure } from './failure'
import {
  disabledMCPTools,
  mcpAuthenticationEnabled,
  mcpRootDirectory,
  mcpScope
} from './preferences'

export interface AutomationHealth {
  status: 'ok' | 'no_app'
  version?: string
  installCommand?: string
  authRequired?: boolean
  discoveryPath?: string
  tools?: ToolDescriptor[]
}

export interface AutomationServerHandle {
  disconnect: () => void | Promise<void>
  authToken: string | null
  managed: boolean
}

const DEV_AUTOMATION_HTTP_URL = import.meta.env.DEV
  ? __OPENPENCIL_LOCAL_AUTOMATION_HTTP_URL__
  : `http://127.0.0.1:${AUTOMATION_HTTP_PORT}`
export function getMCPServerURL(): string {
  return `${DEV_AUTOMATION_HTTP_URL}/mcp`
}

const DEV_AUTOMATION_AUTH_TOKEN =
  import.meta.env.DEV && typeof __OPENPENCIL_LOCAL_AUTOMATION_TOKEN__ === 'string'
    ? __OPENPENCIL_LOCAL_AUTOMATION_TOKEN__
    : null
const noop = () => undefined

/** Delays used while a spawned server comes up; tests shorten them. */
export interface MCPStartupTiming {
  /** How long to watch for the child exiting before polling its health. */
  earlyExitMs: number
  /** Delay before each of the health polls after spawning. */
  healthPollMs: number
}
const DEFAULT_STARTUP_TIMING: MCPStartupTiming = { earlyExitMs: 250, healthPollMs: 1000 }

let runtimeAutomationAuthToken: string | null = DEV_AUTOMATION_AUTH_TOKEN
let runtimeAutomationStartupError: Error | null = null
let runtimeAutomationStartupFailure: MCPFailure | null = null
let runtimeAutomationHealthFailure: MCPFailure | null = null

/**
 * The startup failure recorded by the most recent spawn attempt. Settings uses
 * this so a missing install, a rejected shell command, or a server that exited
 * is reported instead of a single generic health message.
 */
export function getAutomationStartupError(): Error | null {
  return runtimeAutomationStartupError
}

export function getAutomationStartupFailure(): MCPFailure | null {
  return runtimeAutomationStartupFailure
}

/** Why the most recent health probe failed. */
export function getAutomationHealthFailure(): MCPFailure | null {
  return runtimeAutomationHealthFailure
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function rememberStartupError(error: unknown): null {
  runtimeAutomationStartupError = toError(error)
  runtimeAutomationStartupFailure = classifySpawnFailure(error)
  return null
}

interface AutomationHealthRecord {
  status?: unknown
  version?: unknown
  installCommand?: unknown
  authRequired?: unknown
  discoveryPath?: unknown
  tools?: unknown
}

function isAutomationHealthRecord(value: unknown): value is AutomationHealthRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : null
}

function optionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) return undefined
  return typeof value === 'boolean' ? value : null
}

function parseToolDescriptors(value: unknown): ToolDescriptor[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null
  const descriptors: ToolDescriptor[] = []
  for (const candidate of value) {
    const descriptor = parseToolDescriptor(candidate)
    if (!descriptor) return null
    descriptors.push(descriptor)
  }
  return descriptors
}

function parseAutomationHealth(value: unknown): AutomationHealth | null {
  if (!isAutomationHealthRecord(value)) return null
  if (value.status !== 'ok' && value.status !== 'no_app') return null
  const version = optionalString(value.version)
  const installCommand = optionalString(value.installCommand)
  const authRequired = optionalBoolean(value.authRequired)
  const discoveryPath = optionalString(value.discoveryPath)
  const tools = parseToolDescriptors(value.tools)
  if (
    version === null ||
    installCommand === null ||
    authRequired === null ||
    discoveryPath === null ||
    tools === null
  ) {
    return null
  }
  const health: AutomationHealth = { status: value.status }
  if (version !== undefined) health.version = version
  if (installCommand !== undefined) health.installCommand = installCommand
  if (authRequired !== undefined) health.authRequired = authRequired
  if (discoveryPath !== undefined) health.discoveryPath = discoveryPath
  if (tools !== undefined) health.tools = tools
  return health
}

export async function readAutomationHealth(
  authToken: string | null = runtimeAutomationAuthToken
): Promise<AutomationHealth | null> {
  try {
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined
    const res = await fetch(`${DEV_AUTOMATION_HTTP_URL}/health`, {
      headers,
      signal: AbortSignal.timeout(1000)
    })
    if (!res.ok) {
      // A running server that refuses our token needs a new token; any other
      // status means we are not talking to the server we expect.
      const rejectsCredentials = res.status === 401 || res.status === 403
      runtimeAutomationHealthFailure = rejectsCredentials
        ? mcpFailure('rejected', `HTTP ${res.status}`)
        : mcpFailure('malformed', `HTTP ${res.status}`)
      return null
    }
    const health = parseAutomationHealth(await res.json())
    if (!health) {
      runtimeAutomationHealthFailure = mcpFailure('malformed', `HTTP ${res.status}`)
      return null
    }
    runtimeAutomationHealthFailure = null
    return health
  } catch {
    runtimeAutomationHealthFailure = mcpFailure('unreachable', DEV_AUTOMATION_HTTP_URL)
    return null
  }
}

/**
 * Returns the major.minor portion of a semver string (e.g. "0.5.1" → "0.5").
 * Returns null if the string is not parseable as semver.
 */
function parseMajorMinor(version: string): string | null {
  const match = version.match(/^(\d+)\.(\d+)/)
  return match ? `${match[1]}.${match[2]}` : null
}

function assertCompatibleMCPVersion(health: AutomationHealth): void {
  const runningMajorMinor = health.version ? parseMajorMinor(health.version) : null
  const oursMajorMinor = parseMajorMinor(APP_VERSION)
  if (!oursMajorMinor) return
  if (runningMajorMinor === oursMajorMinor) return
  const runningVersion = health.version ? `v${health.version}` : 'an older version'
  const updateHint = health.installCommand
    ? `Run: ${health.installCommand}, then restart OpenPencil.`
    : `Update the global @open-pencil/mcp package to v${APP_VERSION} with your package manager, then restart OpenPencil.`
  throw new Error(
    `OpenPencil desktop v${APP_VERSION} requires @open-pencil/mcp v${oursMajorMinor}.x ` +
      `(major.minor compatibility), but the running MCP server is ${runningVersion}. ${updateHint}`
  )
}

async function pollHealth(
  attempts: number,
  delayMs: number,
  authToken: string | null = runtimeAutomationAuthToken
): Promise<AutomationHealth | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await promiseTimeout(delayMs)
    const health = await readAutomationHealth(authToken)
    if (health) return health
  }
  return null
}

export async function getAutomationAuthToken(): Promise<string | null> {
  if (runtimeAutomationAuthToken) return runtimeAutomationAuthToken
  const health = await readAutomationHealth()
  if (!health) {
    if (runtimeAutomationStartupError) throw runtimeAutomationStartupError
    throw new Error(
      'MCP server is not reachable. Start it from a development session, then try again.'
    )
  }
  assertCompatibleMCPVersion(health)
  if (health.authRequired) {
    throw new Error('MCP server requires authentication, and this session has no token for it.')
  }
  return null
}

async function configureDevMCP(): Promise<AutomationServerHandle> {
  if (!DEV_AUTOMATION_AUTH_TOKEN) throw new Error('MCP development control token is unavailable')
  const configuration: DevMCPConfiguration = {
    authenticationEnabled: mcpAuthenticationEnabled.value,
    rootDirectory: mcpRootDirectory.value,
    disabledTools: [...disabledMCPTools.value],
    scope: mcpScope()
  }
  const response = await fetch(DEV_MCP_RESTART_PATH, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEV_AUTOMATION_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(configuration)
  })
  if (!response.ok) {
    throw new MCPStartupError(
      `Failed to configure development MCP server (${response.status})`,
      mcpFailure('unknown', `HTTP ${response.status}`)
    )
  }
  const authToken = configuration.authenticationEnabled ? DEV_AUTOMATION_AUTH_TOKEN : null
  const health = await pollHealth(10, 250, authToken)
  if (!health)
    throw new MCPStartupError(
      'Development MCP server did not become healthy',
      mcpFailure('timeout', `${DEV_AUTOMATION_HTTP_URL}/health`)
    )
  runtimeAutomationAuthToken = authToken
  return { disconnect: noop, authToken, managed: true }
}

async function startMCPIfNeeded(
  _timing: MCPStartupTiming
): Promise<AutomationServerHandle | null> {
  runtimeAutomationStartupError = null
  runtimeAutomationStartupFailure = null
  if (import.meta.env.DEV) return configureDevMCP()
  return null
}

export async function spawnMCPIfNeeded(
  timing: MCPStartupTiming = DEFAULT_STARTUP_TIMING
): Promise<AutomationServerHandle | null> {
  try {
    return await startMCPIfNeeded(timing)
  } catch (error) {
    return rememberStartupError(error)
  }
}

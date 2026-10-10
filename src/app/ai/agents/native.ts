import * as v from 'valibot'

import type { ACPAgentDef } from '@open-pencil/core/constants'

import { HARNESS_INSTALL_TARGET } from '@/app/ai/harness/companion'
import { MCP_INSTALL_TARGET } from '@/app/automation/mcp/failure'

const lookupSchema = v.object({
  executables: v.record(v.string(), v.nullable(v.string())),
  /** Versions of OpenPencil's own companions, keyed by package name. */
  versions: v.record(v.string(), v.nullable(v.string())),
  searchPath: v.string()
})

export type AgentLookup = v.InferOutput<typeof lookupSchema>

export async function lookupAgents(): Promise<AgentLookup> {
  return { executables: {}, versions: {}, searchPath: '' }
}

export async function installAgentAdapter(agent: ACPAgentDef, searchPath: string): Promise<void> {
  if (!agent.adapterPackage) throw new Error('This agent does not need an adapter.')
  return installPackage(agent.adapterPackage, searchPath)
}

export async function installCanvasBridge(searchPath: string): Promise<void> {
  await installPackage(MCP_INSTALL_TARGET, searchPath)
}

export async function installHarnessCompanion(searchPath: string): Promise<void> {
  await installPackage(HARNESS_INSTALL_TARGET, searchPath)
}

/** The npm arguments that install a package globally; the desktop shell scope pins them. */
export function npmInstallArgs(packageName: string): string[] {
  // These are public packages; a user's private project registry may not mirror them.
  return ['install', '--global', packageName, '--registry=https://registry.npmjs.org']
}

async function installPackage(packageName: string, _searchPath: string): Promise<void> {
  throw new Error(`Installing ${packageName} is not available in the browser.`)
}

import type { ACPAgentDef } from '@open-pencil/core/constants'

import { aiModelSettings, resolveAIModelRole, resolveModelConnectionAPIKey } from '@/app/ai/models'
import type { AIModelConnection } from '@/app/ai/models/types'

/** The connection whose saved key this agent should start with. */
export function connectionForAgentKey(agent: ACPAgentDef): AIModelConnection | null {
  if (!agent.apiKey) return null
  const providerID = `acp:${agent.id}` as const
  const design = resolveAIModelRole('design')?.connection
  if (design?.providerID === providerID) return design
  return (
    aiModelSettings.value.connections.find((connection) => connection.providerID === providerID) ??
    null
  )
}

/**
 * Environment for one agent process. A saved user key is the only addition, and only for an
 * agent that asks for one. Anything else keeps the process environment as it is.
 */
export async function agentProcessEnv(agent: ACPAgentDef): Promise<Record<string, string>> {
  const apiKey = agent.apiKey
  const connection = connectionForAgentKey(agent)
  if (!apiKey || !connection) return {}
  const value = await resolveModelConnectionAPIKey(connection.id)
  return value ? { [apiKey.env]: value } : {}
}

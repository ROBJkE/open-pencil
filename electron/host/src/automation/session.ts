import type { DocumentStore } from '@open-pencil/engine'

import { runStructural } from './commands'
import { structuralKind } from './names'
import { failed, NOT_IN_THIS_MILESTONE, type ToolOutcome } from './outcome'
import type { AutomationScope } from './scope'
import { runScript } from './script'

/** Desktop-only. WebMCP is absent from this milestone. */
export interface AutomationSession {
  readonly scope: AutomationScope
  readonly store: DocumentStore
  call(name: string, input: unknown): ToolOutcome
  eval(source: string): ToolOutcome
}

export function createAutomationSession(
  store: DocumentStore,
  scope: AutomationScope = 'document'
): AutomationSession {
  return {
    scope,
    store,
    call(name, input) {
      return callTool(store, scope, name, input)
    },
    eval(source) {
      return runScript(store, scope, source)
    }
  }
}

function callTool(
  store: DocumentStore,
  scope: AutomationScope,
  name: string,
  input: unknown
): ToolOutcome {
  const kind = structuralKind(name)
  if (kind === undefined) return failed(NOT_IN_THIS_MILESTONE)
  return runStructural(store, scope, kind, name, input)
}

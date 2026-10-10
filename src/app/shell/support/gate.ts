import { missingSupportSentinels } from './baseline'
import { describeEnvironment, type SupportEnvironment } from './detect'
import { bootFailureNotice, unsupportedNotice } from './guidance'
import { renderSupportNotice } from './render'

async function detectEnvironment(): Promise<SupportEnvironment> {
  const facts = { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }
  return describeEnvironment(facts)
}

/**
 * Check the engine against the support baseline before the app bundle loads.
 * Returns `true` when the app may boot; otherwise the app root now shows
 * platform-specific update guidance and the caller must stop.
 */
export async function runSupportGate(): Promise<boolean> {
  const missing = missingSupportSentinels()
  if (missing.length === 0) return true
  renderSupportNotice(unsupportedNotice(await detectEnvironment(), missing))
  return false
}

/** Replace a blank window with an explanation after the app failed to load. */
export async function reportBootFailure(error: unknown): Promise<void> {
  console.error('[support] boot failed', error)
  renderSupportNotice(bootFailureNotice(await detectEnvironment(), error))
}

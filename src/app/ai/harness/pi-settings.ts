import * as v from 'valibot'

/** The settings Pi's CLI keeps next to its sign-ins; only non-secret fields are read. */
const piSettingsSchema = v.object({
  defaultModel: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)))
})

export interface PiAccount {
  /** Pi's agent folder; the Harness companion reuses the sign-ins stored there. */
  agentDir: string
  /** Pi's default model, used when an OpenPencil Pi profile names none. */
  defaultModel: string | null
  /** Pi keeps sign-ins in `auth.json`; only whether it exists is checked, never its contents. */
  signedIn: boolean
}

/** Reads the default model from Pi's `settings.json`; never touches `auth.json`. */
export function parsePiSettings(text: string): string | null {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), piSettingsSchema), text)
  return parsed.success ? (parsed.output.defaultModel ?? null) : null
}

/**
 * Finds the Pi CLI's agent folder (`~/.pi/agent`), its default model, and whether anyone signed
 * in there, on the desktop. Null where there is no home folder to look in.
 */
export async function readPiAccount(): Promise<PiAccount | null> {
  return null
}

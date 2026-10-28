import * as v from 'valibot'

export function parseWire<T>(schema: v.GenericSchema<unknown, T>, value: unknown): T | null {
  const text = typeof value === 'string' ? value : stringify(value)
  if (text === null) return null
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), schema), text)
  return parsed.success ? parsed.output : null
}

/** A value Electron has already decoded. Raw strings are values, not JSON text. */
export function parseMessage<T>(schema: v.GenericSchema<unknown, T>, value: unknown): T | null {
  const parsed = v.safeParse(schema, value)
  return parsed.success ? parsed.output : null
}

function stringify(value: unknown): string | null {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return null
  }
  try {
    const text = JSON.stringify(value)
    return typeof text === 'string' ? text : null
  } catch {
    return null
  }
}

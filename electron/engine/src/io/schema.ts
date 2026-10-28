import * as v from 'valibot'

import type { JSONValue } from '@open-pencil/session'
import { jsonValueSchema } from '@open-pencil/session/schema'

/**
 * A W3C design token document: one JSON object of groups and tokens.
 * Arrays are rejected so a list cannot pass as an empty record.
 */
export const designTokenFileSchema: v.GenericSchema<unknown, Record<string, JSONValue>> = v.pipe(
  v.unknown(),
  v.check((value) => typeof value === 'object' && value !== null && !Array.isArray(value)),
  v.record(v.string(), jsonValueSchema)
)

export type DesignTokenFile = v.InferOutput<typeof designTokenFileSchema>

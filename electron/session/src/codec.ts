import * as v from 'valibot'

import { checkpointSchema, type Checkpoint } from './schema'

export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDocumentError'
  }
}

export function checkpointToBytes(checkpoint: Checkpoint): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(checkpoint))
}

export function checkpointFromBytes(bytes: Uint8Array): Checkpoint {
  const text = new TextDecoder().decode(bytes)
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), checkpointSchema), text)
  if (!parsed.success)
    throw new InvalidDocumentError('Checkpoint JSON did not match the session schema')
  return parsed.output
}

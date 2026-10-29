import * as v from 'valibot'

import { penDocumentSchema } from '@open-pencil/pen/schema'
import { InvalidDocumentError, type Checkpoint } from '@open-pencil/session'
import { checkpointSchema } from '@open-pencil/session/schema'

import { checkpointFromPen, penDocumentFromCheckpoint } from './document'

/** Reads a session checkpoint or a `.pen` document, and writes the current `.pen` schema. */
export interface DocumentCodec {
  read(bytes: Uint8Array): Checkpoint
  write(checkpoint: Checkpoint): Uint8Array
}

export function createPenCodec(): DocumentCodec {
  return {
    read(bytes) {
      return readDocument(bytes)
    },
    write(checkpoint) {
      return writeDocument(checkpoint)
    }
  }
}

function readDocument(bytes: Uint8Array): Checkpoint {
  const text = new TextDecoder().decode(bytes)
  const checkpoint = v.safeParse(v.pipe(v.string(), v.parseJson(), checkpointSchema), text)
  if (checkpoint.success) return checkpoint.output
  const document = v.safeParse(v.pipe(v.string(), v.parseJson(), penDocumentSchema), text)
  if (document.success) return checkpointFromPen(document.output)
  throw new InvalidDocumentError('Document is not a .pen file or a session checkpoint')
}

function writeDocument(checkpoint: Checkpoint): Uint8Array {
  const text = JSON.stringify(penDocumentFromCheckpoint(checkpoint))
  const document = v.safeParse(v.pipe(v.string(), v.parseJson(), penDocumentSchema), text)
  if (!document.success) {
    throw new InvalidDocumentError(
      `Checkpoint could not be written as a .pen document: ${v.summarize(document.issues)}`
    )
  }
  return new TextEncoder().encode(text)
}

import type { OpenDocumentSpec } from '@open-pencil/session'

import { createPenCodec, type DocumentCodec } from '../pen/codec'
import { loadBytes, type CommandHandler, DocumentStore } from './store'

export interface DocumentEngineOptions {
  codec?: DocumentCodec
  handlers?: readonly CommandHandler[]
}

export function createDocumentEngine(
  spec: OpenDocumentSpec,
  options: DocumentEngineOptions = {}
): DocumentStore {
  const store = new DocumentStore(spec, options.handlers ?? [])
  loadBytes(options.codec ?? createPenCodec(), spec.bytes, store)
  return store
}

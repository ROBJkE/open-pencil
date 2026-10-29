import * as v from 'valibot'
import * as Y from 'yjs'

import type { ApplyResult, JSONValue } from '@open-pencil/session'
import { jsonValueSchema } from '@open-pencil/session/schema'

import type { DocumentStore } from '../graph/store'
import { sameValue } from './json'

/**
 * Comment threads. Each reply is its own map entry, so replies written at once all stay.
 * The thread body, node, and resolved flag are last-write. The bag is what `.pen` stores.
 */

const REPLIES_FIELD = 'replies'

const commentReplySchema = v.object({
  id: v.string(),
  body: v.string(),
  author: v.string(),
  createdAt: v.string()
})

const commentThreadSchema = v.object({
  nodeId: v.string(),
  body: v.string(),
  resolved: v.boolean(),
  replies: v.record(v.string(), commentReplySchema)
})

export type CommentReply = v.InferOutput<typeof commentReplySchema>
export type CommentThread = v.InferOutput<typeof commentThreadSchema>

export interface CommentDraft {
  readonly nodeId: string
  readonly body: string
  readonly resolved: boolean
}

export interface CommentBinding {
  writeThread(threadId: string, draft: CommentDraft): ApplyResult
  addReply(threadId: string, reply: CommentReply): ApplyResult
  unbind(): void
}

export function readCommentThread(value: JSONValue | undefined): CommentThread | undefined {
  const parsed = v.safeParse(commentThreadSchema, value)
  return parsed.success ? parsed.output : undefined
}

export function bindComments(doc: Y.Doc, store: DocumentStore): CommentBinding {
  const threads = doc.getMap<unknown>('comments')
  const onThreads: Parameters<Y.Map<unknown>['observeDeep']>[0] = (events, transaction) => {
    if (transaction.local) return
    for (const threadId of threadIds(threads, events)) publish(store, threads, threadId)
  }
  threads.observeDeep(onThreads)
  return {
    writeThread(threadId, draft) {
      doc.transact(() => {
        const thread = ensureMap(threads, threadId)
        thread.set('nodeId', draft.nodeId)
        thread.set('body', draft.body)
        thread.set('resolved', draft.resolved)
        replyMap(thread)
      })
      return publish(store, threads, threadId)
    },
    addReply(threadId, reply) {
      doc.transact(() => {
        const thread = ensureMap(threads, threadId)
        replyMap(thread).set(reply.id, replyValue(reply))
      })
      return publish(store, threads, threadId)
    },
    unbind() {
      threads.unobserveDeep(onThreads)
    }
  }
}

function publish(store: DocumentStore, threads: Y.Map<unknown>, threadId: string): ApplyResult {
  const value = threads.get(threadId)
  const thread = value instanceof Y.Map ? threadFromMap(value) : undefined
  if (!thread) return { ack: store.fail('invalid-comment'), events: [] }
  const json = threadValue(thread)
  const current = store.bag('comments')[threadId]
  if (sameValue(current, json)) return { ack: store.succeed(), events: [] }
  return store.writeBag('comments', threadId, json)
}

function threadFromMap(thread: Y.Map<unknown>): CommentThread | undefined {
  const nodeId = thread.get('nodeId')
  const body = thread.get('body')
  const resolved = thread.get('resolved')
  if (typeof nodeId !== 'string' || nodeId.length === 0 || typeof body !== 'string')
    return undefined
  if (typeof resolved !== 'boolean') return undefined
  return readCommentThread({
    nodeId,
    body,
    resolved,
    replies: cleanReplies(thread.get(REPLIES_FIELD))
  })
}

function cleanReplies(value: unknown): Record<string, JSONValue> {
  const plain = value instanceof Y.Map ? value.toJSON() : value
  const record = v.safeParse(v.record(v.string(), jsonValueSchema), plain)
  if (!record.success) return {}
  const replies: Record<string, JSONValue> = {}
  for (const [id, reply] of Object.entries(record.output)) {
    const parsed = v.safeParse(commentReplySchema, reply)
    if (!parsed.success) continue
    replies[id] = replyValue(parsed.output)
  }
  return replies
}

function threadValue(thread: CommentThread): JSONValue {
  const replies: Record<string, JSONValue> = {}
  for (const [id, reply] of Object.entries(thread.replies)) replies[id] = replyValue(reply)
  return { nodeId: thread.nodeId, body: thread.body, resolved: thread.resolved, replies }
}

function replyValue(reply: CommentReply): JSONValue {
  return { id: reply.id, body: reply.body, author: reply.author, createdAt: reply.createdAt }
}

function replyMap(thread: Y.Map<unknown>): Y.Map<unknown> {
  const existing = thread.get(REPLIES_FIELD)
  if (existing instanceof Y.Map) return existing
  const created = new Y.Map<unknown>()
  thread.set(REPLIES_FIELD, created)
  return created
}

function ensureMap(records: Y.Map<unknown>, id: string): Y.Map<unknown> {
  const existing = records.get(id)
  if (existing instanceof Y.Map) return existing
  const created = new Y.Map<unknown>()
  records.set(id, created)
  return created
}

type ObserveEvents = Parameters<Parameters<Y.Map<unknown>['observeDeep']>[0]>[0]

function threadIds(threads: Y.Map<unknown>, events: ObserveEvents): string[] {
  const ids = new Set<string>()
  for (const event of events) {
    const head = event.path[0]
    if (typeof head === 'string') ids.add(head)
    else if (event.target === threads) {
      for (const key of event.keys.keys()) ids.add(key)
    }
  }
  return [...ids]
}

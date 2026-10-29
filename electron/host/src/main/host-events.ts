import * as v from 'valibot'

import { parseWire } from '../wire'

const hostEventSchema = v.variant('type', [
  v.object({
    type: v.literal('document-opened'),
    id: v.string(),
    name: v.string(),
    path: v.nullable(v.string())
  }),
  v.object({
    type: v.literal('document-closed'),
    id: v.string()
  }),
  v.object({
    type: v.literal('document-saved'),
    id: v.string(),
    path: v.string()
  }),
  v.object({
    type: v.literal('documents'),
    activeId: v.nullable(v.string()),
    documents: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        path: v.nullable(v.string())
      })
    )
  }),
  v.object({
    type: v.literal('menu'),
    id: v.string(),
    checked: v.optional(v.boolean())
  }),
  v.object({
    type: v.literal('restart-request'),
    id: v.string()
  }),
  v.object({
    type: v.literal('secret-error'),
    error: v.picklist(['encryption-unavailable', 'invalid-account', 'invalid-value', 'failed'])
  }),
  v.object({
    type: v.literal('link'),
    link: v.variant('type', [
      v.object({
        type: v.literal('open'),
        file: v.string(),
        node: v.nullable(v.string())
      }),
      v.object({ type: v.literal('join'), room: v.string() }),
      v.object({ type: v.literal('oauth'), provider: v.string(), query: v.string() }),
      v.object({
        type: v.literal('cloud'),
        kind: v.picklist(['invitations', 'share']),
        id: v.string(),
        server: v.string(),
        secret: v.string()
      })
    ])
  })
])

export type HostEvent = v.InferOutput<typeof hostEventSchema>

const restartReplySchema = v.object({
  id: v.string(),
  action: v.picklist(['finish', 'cancel'])
})

export type RestartReply = v.InferOutput<typeof restartReplySchema>

const menuStateSchema = v.object({
  features: v.optional(v.array(v.string())),
  checked: v.optional(v.record(v.string(), v.boolean()))
})

export type MenuStateUpdate = v.InferOutput<typeof menuStateSchema>

const updateStatusSchema = v.object({
  state: v.picklist(['idle', 'checking', 'available', 'downloading', 'downloaded', 'error']),
  detail: v.optional(v.string())
})

export type UpdateStatus = v.InferOutput<typeof updateStatusSchema>

export function parseHostEvent(value: unknown): HostEvent | null {
  return parseWire(hostEventSchema, value)
}

export function parseRestartReply(value: unknown): RestartReply | null {
  return parseWire(restartReplySchema, value)
}

export function parseMenuState(value: unknown): MenuStateUpdate | null {
  return parseWire(menuStateSchema, value)
}

export function parseUpdateStatus(value: unknown): UpdateStatus | null {
  return parseWire(updateStatusSchema, value)
}

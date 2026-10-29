/** A peer's call flags. `call` is null when they are not in the call. */
export interface VoicePeer {
  readonly id: string
  readonly call: {
    readonly muted: boolean
    readonly speaking: boolean
  } | null
}

/** Someone in the call: membership, mute, and speaking. No microphone audio. */
export interface VoiceMember {
  readonly id: string
  readonly muted: boolean
  readonly speaking: boolean
}

/**
 * Who is in the call, whether they are muted, and whether they are speaking.
 * The document process does not capture or play microphone audio.
 */
export function voiceState(peers: readonly VoicePeer[]): readonly VoiceMember[] {
  const members: VoiceMember[] = []
  for (const peer of peers) {
    if (peer.call === null) continue
    members.push({ id: peer.id, muted: peer.call.muted, speaking: peer.call.speaking })
  }
  return members
}

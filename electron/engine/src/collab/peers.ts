/**
 * Public MQTT brokers and STUN/TURN servers a room window uses to introduce peers.
 * This is third-party infrastructure. There is no OpenPencil Cloud relay.
 * Either list can be replaced; an omitted list keeps today's defaults.
 */

export interface IceServer {
  readonly urls: string
  readonly username?: string
  readonly credential?: string
}

export interface PeerSettings {
  readonly brokers: readonly string[]
  readonly iceServers: readonly IceServer[]
}

/** Trystero's public MQTT brokers, the ones a room uses when settings do not replace them. */
export const DEFAULT_BROKERS: readonly string[] = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://public:public@public.cloud.shiftr.io',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt'
]

/** Public STUN and the open-relay TURN servers the current share flow uses. */
export const DEFAULT_ICE_SERVERS: readonly IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
]

export function peerSettings(override: Partial<PeerSettings> = {}): PeerSettings {
  const brokers = override.brokers ?? DEFAULT_BROKERS
  const iceServers = override.iceServers ?? DEFAULT_ICE_SERVERS
  return {
    brokers: [...brokers],
    iceServers: iceServers.map(copyIce)
  }
}

function copyIce(server: IceServer): IceServer {
  if (server.username !== undefined && server.credential !== undefined) {
    return { urls: server.urls, username: server.username, credential: server.credential }
  }
  if (server.username !== undefined) return { urls: server.urls, username: server.username }
  if (server.credential !== undefined) return { urls: server.urls, credential: server.credential }
  return { urls: server.urls }
}

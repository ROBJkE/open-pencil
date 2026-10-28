import { checkpointFromBytes, checkpointToBytes, type Checkpoint } from '@open-pencil/session'

/** Reads and writes the normalized checkpoint. The `.pen` codec replaces this module. */
export interface DocumentCodec {
  read(bytes: Uint8Array): Checkpoint
  write(checkpoint: Checkpoint): Uint8Array
}

export function createPenCodec(): DocumentCodec {
  return {
    read: checkpointFromBytes,
    write: checkpointToBytes
  }
}

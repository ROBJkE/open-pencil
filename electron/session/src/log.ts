import type { LogEntry, Operation } from './schema'

export interface OperationLog {
  sequence: number
  append(forward: Operation[], inverse: Operation[], coalesceKey: string | null): LogEntry
  tip(coalesceKey: string): LogEntry | null
  replaceTip(forward: Operation[]): LogEntry | null
  undo(): LogEntry | null
  redo(): LogEntry | null
  entries(): LogEntry[]
  history(): { entries: LogEntry[]; undone: number }
  undoneCount(): number
  restore(entries: LogEntry[], undone: number): void
}

export function createOperationLog(): OperationLog {
  const committed: LogEntry[] = []
  let undone = 0

  function tip(coalesceKey: string): LogEntry | null {
    if (undone !== 0) return null
    const entry = committed.at(-1)
    if (!entry || entry.coalesceKey !== coalesceKey) return null
    return entry
  }

  return {
    get sequence() {
      return committed.at(-1 - undone)?.sequence ?? 0
    },
    append(forward, inverse, coalesceKey) {
      if (undone > 0) {
        committed.splice(committed.length - undone, undone)
        undone = 0
      }
      const entry: LogEntry = {
        sequence: (committed.at(-1)?.sequence ?? 0) + 1,
        coalesceKey,
        forward,
        inverse
      }
      committed.push(entry)
      return entry
    },
    tip,
    replaceTip(forward) {
      const entry = committed.at(-1)
      if (!entry || undone !== 0) return null
      entry.forward = forward
      return entry
    },
    undo() {
      if (undone >= committed.length) return null
      undone += 1
      return committed.at(-undone) ?? null
    },
    redo() {
      if (undone === 0) return null
      const entry = committed.at(-undone)
      undone -= 1
      return entry ?? null
    },
    entries() {
      return committed.slice(0, committed.length - undone)
    },
    history() {
      return {
        entries: committed.map((entry) => structuredClone(entry)),
        undone
      }
    },
    undoneCount() {
      return undone
    },
    restore(entries, nextUndone) {
      committed.splice(0, committed.length, ...entries.map((entry) => structuredClone(entry)))
      undone = Math.min(Math.max(0, nextUndone), committed.length)
    }
  }
}

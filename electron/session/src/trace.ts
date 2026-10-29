export interface LongTask {
  name: string
  startMs: number
  durationMs: number
}

/** Tasks the UI process must fail. Shared CI uses this; it does not assert a hardware budget. */
export function findLongTasks(tasks: readonly LongTask[], limitMs = 16): LongTask[] {
  return tasks.filter((task) => task.durationMs > limitMs)
}

/**
 * Fails the UI process when any task exceeds one frame.
 * The error lists those tasks. Full traces stay on a manual machine.
 */
export function assertNoLongTasks(tasks: readonly LongTask[], limitMs = 16): void {
  const long = findLongTasks(tasks, limitMs)
  if (long.length === 0) return
  const detail = long.map((task) => `${task.name} ${task.durationMs}ms`).join(', ')
  throw new Error(`UI long task over ${limitMs}ms: ${detail}`)
}

export interface LongTask {
  name: string
  startMs: number
  durationMs: number
}

/** Tasks the UI process must fail. Shared CI uses this; it does not assert a hardware budget. */
export function findLongTasks(tasks: readonly LongTask[], limitMs = 16): LongTask[] {
  return tasks.filter((task) => task.durationMs > limitMs)
}

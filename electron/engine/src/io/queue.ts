/**
 * One document-process job at a time.
 * After the first job, the queue waits for a timer turn before the next one,
 * so an export leaves room for pan and typing.
 * A job must not wait on another job from this same queue.
 */
export interface JobQueue {
  enqueue<T>(job: () => Promise<T> | T): Promise<T>
}

interface QueueState {
  chain: Promise<void>
  ran: boolean
}

export function createJobQueue(): JobQueue {
  const state: QueueState = { chain: Promise.resolve(), ran: false }
  return {
    enqueue<T>(job: () => Promise<T> | T): Promise<T> {
      const result = state.chain.then(() => perform(state, job))
      state.chain = settle(result)
      return result
    }
  }
}

async function perform<T>(state: QueueState, job: () => Promise<T> | T): Promise<T> {
  if (state.ran) await yieldTurn()
  state.ran = true
  return job()
}

function settle(result: Promise<unknown>): Promise<void> {
  return result.then(
    () => undefined,
    () => undefined
  )
}

function yieldTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

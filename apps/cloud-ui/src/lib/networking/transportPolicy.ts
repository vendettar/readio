import { log } from '../logger'
import { sleepWithAbort } from './timeouts'

export interface RetryDecision {
  retry: boolean
  delayMs: number
  reason?: string
}

export interface RetryContext {
  attempt: number
  signal?: AbortSignal
}

/**
 * Executes an async function with pluggable retry and backoff logic.
 * Decouples transport resilience from domain-specific request logic.
 */
export async function executeWithRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: {
    classifyError: (error: unknown, context: RetryContext) => RetryDecision
    onRetry?: (error: unknown, context: RetryContext, decision: RetryDecision) => void
    signal?: AbortSignal
  }
): Promise<T> {
  const { classifyError, onRetry, signal } = options
  let attempt = 0

  while (true) {
    if (signal?.aborted) {
      throw signal.reason || new Error('Aborted')
    }

    try {
      return await fn(signal)
    } catch (error) {
      if (signal?.aborted) throw error

      const context: RetryContext = { attempt, signal }
      const decision = classifyError(error, context)

      if (!decision.retry) {
        throw error
      }

      attempt++
      if (onRetry) {
        onRetry(error, context, decision)
      } else {
        log(
          `[transport] retrying after ${decision.delayMs}ms (reason: ${decision.reason || 'unknown'})`
        )
      }

      await sleepWithAbort(decision.delayMs, signal)
    }
  }
}

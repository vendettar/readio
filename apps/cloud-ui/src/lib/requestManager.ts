import { getAppConfig } from './runtimeConfig'

type InflightRequest<T> = {
  promise: Promise<T>
  abortController: AbortController
  activeCallers: number
}

const inflight = new Map<string, InflightRequest<unknown>>()

const getPoolSize = () => Math.max(1, getAppConfig().MAX_CONCURRENT_REQUESTS)
let activeRequests = 0
const pendingQueue: Array<() => void> = []

/** Reset all request manager state (for testing only) */
export function __resetRequestManagerStateForTests(): void {
  for (const request of inflight.values()) {
    request.abortController.abort()
  }
  inflight.clear()
  activeRequests = 0
  pendingQueue.length = 0
}

/**
 * Generate a cache key for a request
 */
export function getRequestKey(url: string, options?: { method?: string }): string {
  const method = options?.method || 'GET'
  return `${method}:${url}`
}

/**
 * Wait for a slot in the concurrency pool
 */
async function acquireSlot(): Promise<void> {
  if (activeRequests < getPoolSize()) {
    activeRequests++
    return
  }

  return new Promise<void>((resolve) => {
    pendingQueue.push(() => {
      activeRequests++
      resolve()
    })
  })
}

/**
 * Release a slot back to the pool
 */
function releaseSlot(): void {
  activeRequests--
  const next = pendingQueue.shift()
  if (next) {
    next()
  }
}

/**
 * Deduplicated fetch: if the same request is in-flight, return its promise
 */
export async function deduplicatedFetch<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: {
    /** If true, abort any existing request with the same key first */
    abortPrevious?: boolean
  }
): Promise<T> {
  let existing = inflight.get(key) as InflightRequest<T> | undefined

  if (existing) {
    if (options?.abortPrevious) {
      existing.abortController.abort()
      inflight.delete(key)
      existing = undefined
    } else {
      existing.activeCallers++
      const currentReq = existing
      return currentReq.promise.finally(() => {
        currentReq.activeCallers--
      })
    }
  }

  const abortController = new AbortController()

  const execute = async (): Promise<T> => {
    await acquireSlot()

    try {
      if (abortController.signal.aborted)
        throw abortController.signal.reason || toAbortError('Aborted')
      return await fetcher(abortController.signal)
    } finally {
      releaseSlot()
      inflight.delete(key)
    }
  }

  const promise = execute()
  existing = { promise, abortController, activeCallers: 1 }
  inflight.set(key, existing)

  const currentReq = existing
  return currentReq.promise.finally(() => {
    currentReq.activeCallers--
  })
}

export function toAbortError(reason?: unknown): Error {
  if (reason instanceof Error) return reason
  const error = new Error(typeof reason === 'string' && reason ? reason : 'AbortError')
  error.name = 'AbortError'
  return error
}

export function deduplicatedFetchWithCallerAbort<T>(
  key: string,
  requestSignal: AbortSignal | undefined,
  fetcher: (sharedSignal: AbortSignal) => Promise<T>,
  options?: {
    abortPrevious?: boolean
  }
): Promise<T> {
  if (requestSignal?.aborted) {
    return Promise.reject(toAbortError(requestSignal.reason))
  }

  let existing = inflight.get(key) as InflightRequest<T> | undefined

  if (existing) {
    if (options?.abortPrevious) {
      existing.abortController.abort()
      inflight.delete(key)
      existing = undefined
    }
  }

  if (!existing) {
    const abortController = new AbortController()
    const execute = async (): Promise<T> => {
      await acquireSlot()
      try {
        if (abortController.signal.aborted)
          throw abortController.signal.reason || toAbortError('Aborted')
        return await fetcher(abortController.signal)
      } finally {
        releaseSlot()
        inflight.delete(key)
      }
    }

    const promise = execute()
    existing = { promise, abortController, activeCallers: 0 }
    inflight.set(key, existing)
  }

  const sharedReq = existing
  sharedReq.activeCallers++

  if (!requestSignal) {
    return sharedReq.promise.finally(() => {
      sharedReq.activeCallers--
    })
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false

    const cleanupCaller = () => {
      if (!settled) {
        settled = true
        sharedReq.activeCallers--
        if (sharedReq.activeCallers <= 0) {
          sharedReq.abortController.abort()
          inflight.delete(key)
        }
      }
    }

    const onAbort = () => {
      if (settled) return
      cleanupCaller()
      reject(toAbortError(requestSignal.reason))
    }

    requestSignal.addEventListener('abort', onAbort, { once: true })

    sharedReq.promise.then(
      (value) => {
        if (!settled) {
          cleanupCaller()
          requestSignal.removeEventListener('abort', onAbort)
          resolve(value)
        }
      },
      (error) => {
        if (!settled) {
          cleanupCaller()
          requestSignal.removeEventListener('abort', onAbort)
          reject(error)
        }
      }
    )
  })
}

/**
 * Check if a request is in-flight by key
 */
export function isRequestInflight(key: string): boolean {
  return inflight.has(key)
}

/**
 * Abort a specific request by key
 */
export function abortRequest(key: string): boolean {
  const existing = inflight.get(key)
  if (existing) {
    existing.abortController.abort()
    inflight.delete(key)
    return true
  }
  return false
}

/**
 * Abort all requests matching a prefix
 */
export function abortRequestsWithPrefix(prefix: string): number {
  let count = 0
  for (const [key, request] of inflight.entries()) {
    if (key.startsWith(prefix)) {
      request.abortController.abort()
      inflight.delete(key)
      count++
    }
  }
  return count
}

/**
 * Abort all inflight requests
 */
export function abortAllRequests(): number {
  let count = 0
  for (const [key, request] of inflight.entries()) {
    request.abortController.abort()
    inflight.delete(key)
    count++
  }
  return count
}

/**
 * Get current request stats
 */
export function getRequestStats(): {
  inflight: number
  active: number
  pending: number
} {
  return {
    inflight: inflight.size,
    active: activeRequests,
    pending: pendingQueue.length,
  }
}

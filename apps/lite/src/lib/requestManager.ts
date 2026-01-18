// src/lib/requestManager.ts
// Request deduplication and concurrency control

type InflightRequest<T> = {
  promise: Promise<T>
  abortController: AbortController
}

const inflight = new Map<string, InflightRequest<unknown>>()

const MAX_CONCURRENT_REQUESTS = 6
let activeRequests = 0
const pendingQueue: Array<() => void> = []

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
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
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
  const existing = inflight.get(key) as InflightRequest<T> | undefined

  if (existing) {
    if (options?.abortPrevious) {
      existing.abortController.abort()
      inflight.delete(key)
    } else {
      // Return existing promise (deduplication)
      return existing.promise
    }
  }

  const abortController = new AbortController()

  const execute = async (): Promise<T> => {
    await acquireSlot()

    try {
      const result = await fetcher(abortController.signal)
      return result
    } finally {
      releaseSlot()
      inflight.delete(key)
    }
  }

  const promise = execute()
  inflight.set(key, { promise, abortController })

  return promise
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

import { log } from '../logger'

export class CircuitTripError extends Error {
  proxyUrl: string
  constructor(proxyUrl: string) {
    super(`Circuit breaker tripped for proxy: ${proxyUrl}`)
    this.name = 'CircuitTripError'
    this.proxyUrl = proxyUrl
  }
}

export const CircuitBreaker = {
  states: new Map<string, { failureCount: number; lastFailureAt: number }>(),
  FAILURE_THRESHOLD: 5,
  TRIP_DURATION_MS: 30000,

  isTripped(url: string): boolean {
    if (import.meta.env.MODE === 'test') return false
    const key = this.getOrigin(url)
    const state = this.states.get(key)
    if (!state) return false
    if (state.failureCount >= this.FAILURE_THRESHOLD) {
      const now = Date.now()
      if (now - state.lastFailureAt < this.TRIP_DURATION_MS) {
        return true
      }
    }
    return false
  },

  recordSuccess(url: string): void {
    const key = this.getOrigin(url)
    this.states.delete(key)
  },

  recordFailure(url: string): void {
    const key = this.getOrigin(url)
    const state = this.states.get(key) || { failureCount: 0, lastFailureAt: 0 }
    state.failureCount++
    state.lastFailureAt = Date.now()
    this.states.set(key, state)
    if (state.failureCount >= this.FAILURE_THRESHOLD) {
      log(`[CircuitBreaker] Tripped for ${key} due to ${state.failureCount} consecutive failures`)
    }
  },

  getOrigin(url: string): string {
    try {
      const u = new URL(url)
      return `${u.protocol}//${u.host}`
    } catch {
      return url
    }
  },
}

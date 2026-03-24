import { describe, expect, it } from 'vitest'
import { CircuitBreaker } from '../circuitBreaker'

describe('networking/circuitBreaker', () => {
  it('records failure and clears state on success', () => {
    const url = 'https://proxy.example.com/path'
    const origin = CircuitBreaker.getOrigin(url)

    CircuitBreaker.recordFailure(url)
    expect(CircuitBreaker.states.get(origin)?.failureCount).toBeGreaterThan(0)

    CircuitBreaker.recordSuccess(url)
    expect(CircuitBreaker.states.has(origin)).toBe(false)
  })

  it('returns false for isTripped in test mode', () => {
    const url = 'https://proxy.example.com/path'
    for (let i = 0; i < 10; i++) {
      CircuitBreaker.recordFailure(url)
    }

    expect(CircuitBreaker.isTripped(url)).toBe(false)
    CircuitBreaker.recordSuccess(url)
  })
})

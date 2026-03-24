import { describe, expect, it } from 'vitest'
import { extractRetryAfterMs } from '../../asr/providers/openaiCompatible'

describe('ASR Rate Limit Parser', () => {
  it('parses Retry-After headers in seconds', () => {
    const headers = new Headers({ 'retry-after': '45' })
    const response = new Response(null, { status: 429, headers })

    const result = extractRetryAfterMs(response, 'Rate limited')
    expect(result.retryAfterMs).toBe(45000)
    expect(result.rateLimitKind).toBe('generic')
  })

  it('parses Retry-After headers in HTTP-Date', () => {
    const future = new Date(Date.now() + 10000).toUTCString()
    const headers = new Headers({ 'retry-after': future })
    const response = new Response(null, { status: 429, headers })

    const result = extractRetryAfterMs(response, 'Rate limited')
    expect(result.retryAfterMs).toBeGreaterThan(9000)
    expect(result.retryAfterMs).toBeLessThanOrEqual(10000)
    expect(result.rateLimitKind).toBe('generic')
  })

  it('parses "try again in X.Xs" text', () => {
    const response = new Response(null, { status: 429 })

    const result = extractRetryAfterMs(response, 'Please try again in 12.5s.')
    expect(result.retryAfterMs).toBe(12500)
    expect(result.rateLimitKind).toBe('generic')
  })

  it('detects ASPH limits and fallbacks to 61 minutes', () => {
    const response = new Response(null, { status: 429 })

    const result = extractRetryAfterMs(response, 'Limit (ASPH) reached. Please try again in 2700s.')
    // Since 2700s is less than 60 mins fallback, it should enforce the fallback
    expect(result.retryAfterMs).toBe(61 * 60 * 1000)
    expect(result.rateLimitKind).toBe('asph')
  })

  it('does not enforce ASPH fallback it already larger', () => {
    const response = new Response(null, { status: 429 })
    const result = extractRetryAfterMs(response, 'Limit (ASPH) reached. Please try again in 7200s.')
    expect(result.retryAfterMs).toBe(7200000)
    expect(result.rateLimitKind).toBe('asph')
  })

  it('handles empty responses without throwing', () => {
    const response = new Response(null, { status: 500 })
    const result = extractRetryAfterMs(response, '')
    expect(result.retryAfterMs).toBeUndefined()
    expect(result.rateLimitKind).toBeNull()
  })
})

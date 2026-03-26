import { describe, expect, it } from 'vitest'
import {
  API_CACHE_NAME,
  API_RUNTIME_CACHING,
  AUDIO_CACHE_NAME,
  AUDIO_RUNTIME_CACHING,
  isAudioRequest,
  isDiscoveryApiRequest,
} from '../runtimeCaching'

describe('PWA runtime caching policy', () => {
  it('classifies audio requests for range-aware cache', () => {
    expect(isAudioRequest({ url: new URL('https://cdn.example.com/track.mp3') })).toBe(true)
    expect(isAudioRequest({ url: new URL('https://cdn.example.com/track.m4a') })).toBe(true)
    expect(isAudioRequest({ url: new URL('https://cdn.example.com/feed.xml') })).toBe(false)
  })

  it('classifies discovery API and feed requests into API cache partition', () => {
    expect(
      isDiscoveryApiRequest({ url: new URL('https://itunes.apple.com/search?term=test') })
    ).toBe(true)
    expect(isDiscoveryApiRequest({ url: new URL('https://example.com/podcast/feed.xml') })).toBe(
      true
    )
    expect(isDiscoveryApiRequest({ url: new URL('https://cdn.example.com/track.mp3') })).toBe(false)
  })

  it('keeps audio cache bounded and range-capable', () => {
    expect(AUDIO_RUNTIME_CACHING.options.cacheName).toBe(AUDIO_CACHE_NAME)
    expect(AUDIO_RUNTIME_CACHING.options.rangeRequests).toBe(true)
    expect(AUDIO_RUNTIME_CACHING.options.expiration.maxEntries).toBe(50)
    expect(AUDIO_RUNTIME_CACHING.options.cacheableResponse.statuses).toEqual([200, 206])
  })

  it('uses a dedicated cache partition for discovery APIs', () => {
    expect(API_RUNTIME_CACHING.options.cacheName).toBe(API_CACHE_NAME)
    expect(API_RUNTIME_CACHING.handler).toBe('NetworkFirst')
    expect(API_RUNTIME_CACHING.options.expiration.maxEntries).toBe(80)
  })
})

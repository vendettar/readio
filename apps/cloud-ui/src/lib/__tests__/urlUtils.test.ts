import { describe, expect, it } from 'vitest'
import { normalizePodcastAudioUrl, sha256, unwrapPodcastTrackingUrl } from '../networking/urlUtils'

describe('urlUtils: normalizePodcastAudioUrl', () => {
  it('normalizes protocol and host', () => {
    expect(normalizePodcastAudioUrl('HTTP://Example.Com/Path')).toBe('https://example.com/Path')
  })

  it('removes tracking query parameters', () => {
    const url = 'https://example.com/audio.mp3?utm_source=fb&fbclid=123&other=val'
    expect(normalizePodcastAudioUrl(url)).toBe('https://example.com/audio.mp3?other=val')
  })

  it('removes fragments', () => {
    expect(normalizePodcastAudioUrl('https://example.com/a.mp3#hash')).toBe(
      'https://example.com/a.mp3'
    )
  })

  it('removes trailing slashes', () => {
    expect(normalizePodcastAudioUrl('https://example.com/path/')).toBe('https://example.com/path')
  })
})

describe('urlUtils: sha256 (Instruction 125)', () => {
  it('returns lowercase hex for a string', async () => {
    const input = 'hello'
    // Expected SHA-256 for 'hello' is 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const result = await sha256(input)
    expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    // Verify it is lowercase hex
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates different hashes for different inputs', async () => {
    const h1 = await sha256('apple')
    const h2 = await sha256('banana')
    expect(h1).not.toBe(h2)
  })
})

describe('urlUtils: unwrapPodcastTrackingUrl', () => {
  it('unwraps a chained tracking URL correctly', () => {
    const url =
      'https://dts.podtrac.com/redirect.mp3/pdst.fm/e/pfx.vpixl.com/123/pscrb.fm/rss/p/nyt.simplecastaudio.com/audio.mp3'
    expect(unwrapPodcastTrackingUrl(url)).toBe('https://nyt.simplecastaudio.com/audio.mp3')
  })

  it('leaves a regular URL unchanged', () => {
    const url = 'https://cdn.podcasts.com/episode1.mp3'
    expect(unwrapPodcastTrackingUrl(url)).toBe(url)
  })

  it('handles http correctly turning it to https during unwrap', () => {
    const url =
      'http://dts.podtrac.com/redirect.mp3/chrt.fm/track/123/anchor.fm/s/123/podcast/play/1.m4a'
    expect(unwrapPodcastTrackingUrl(url)).toBe('https://anchor.fm/s/123/podcast/play/1.m4a')
  })
})

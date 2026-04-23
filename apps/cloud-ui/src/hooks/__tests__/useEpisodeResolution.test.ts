import { describe, expect, it } from 'vitest'
import { resolveEpisodeResolutionError } from '../useEpisodeResolution'

describe('resolveEpisodeResolutionError', () => {
  it('prioritizes podcast lookup failures', () => {
    const podcastError = new Error('podcast')
    const feedError = new Error('feed')

    expect(
      resolveEpisodeResolutionError({
        podcastError,
        feedError,
      })
    ).toBe(podcastError)
  })

  it('falls back to rss feed failures when podcast lookup succeeded', () => {
    const feedError = new Error('feed')

    expect(
      resolveEpisodeResolutionError({
        podcastError: null,
        feedError,
      })
    ).toBe(feedError)
  })
})

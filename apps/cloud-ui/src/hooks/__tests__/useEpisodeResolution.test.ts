import { describe, expect, it } from 'vitest'
import { resolveEpisodeResolutionError } from '../useEpisodeResolution'

describe('resolveEpisodeResolutionError', () => {
  it('prioritizes podcast lookup failures', () => {
    const podcastError = new Error('podcast')
    const feedError = new Error('feed')
    const supplementalEpisodesError = new Error('episodes')

    expect(
      resolveEpisodeResolutionError({
        podcastError,
        feedError,
        supplementalEpisodesError,
      })
    ).toBe(podcastError)
  })

  it('prefers supplemental episode failures over rss fallback failures', () => {
    const feedError = new Error('feed')
    const supplementalEpisodesError = new Error('episodes')

    expect(
      resolveEpisodeResolutionError({
        podcastError: null,
        feedError,
        supplementalEpisodesError,
      })
    ).toBe(supplementalEpisodesError)
  })
})

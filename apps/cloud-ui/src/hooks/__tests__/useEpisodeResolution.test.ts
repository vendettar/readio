import { describe, expect, it } from 'vitest'
import { resolveEpisodeResolutionError } from '../useEpisodeResolution'

describe('resolveEpisodeResolutionError', () => {
  it('prioritizes podcast lookup failures', () => {
    const podcastError = new Error('podcast')
    const episodesError = new Error('episodes')

    expect(
      resolveEpisodeResolutionError({
        podcastError,
        episodesError,
      })
    ).toBe(podcastError)
  })

  it('falls back to PI episode list failures when podcast lookup succeeded', () => {
    const episodesError = new Error('episodes')

    expect(
      resolveEpisodeResolutionError({
        podcastError: null,
        episodesError,
      })
    ).toBe(episodesError)
  })
})

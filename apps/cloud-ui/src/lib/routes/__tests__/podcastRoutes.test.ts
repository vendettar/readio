import { describe, expect, it } from 'vitest'
import {
  buildPodcastEpisodeRoute,
  buildPodcastShowRoute,
  normalizeCountryParam,
} from '../podcastRoutes'

describe('podcastRoutes', () => {
  describe('normalizeCountryParam', () => {
    it('normalizes mixed-case supported countries to lowercase', () => {
      expect(normalizeCountryParam('US')).toBe('us')
      expect(normalizeCountryParam(' Jp ')).toBe('jp')
    })

    it('returns null for unsupported countries', () => {
      expect(normalizeCountryParam('xx')).toBeNull()
      expect(normalizeCountryParam('')).toBeNull()
      expect(normalizeCountryParam(undefined)).toBeNull()
    })
  })

  it('builds show route objects for valid countries only', () => {
    expect(
      buildPodcastShowRoute({
        country: 'US',
        podcastId: '1234',
      })
    ).toEqual({
      to: '/podcast/$country/$id',
      params: { country: 'us', id: '1234' },
    })

    expect(buildPodcastShowRoute({ country: 'xx', podcastId: '1234' })).toBeNull()
  })

  it('builds episode route objects for valid countries only', () => {
    expect(
      buildPodcastEpisodeRoute({
        country: 'De',
        podcastId: '1234',
        episodeKey: 'dm8RLqvNEjRWeAfgXlSAdA',
      })
    ).toEqual({
      to: '/podcast/$country/$id/$episodeKey',
      params: {
        country: 'de',
        id: '1234',
        episodeKey: 'dm8RLqvNEjRWeAfgXlSAdA',
      },
    })

    expect(
      buildPodcastEpisodeRoute({
        country: null,
        podcastId: '1234',
        episodeKey: 'dm8RLqvNEjRWeAfgXlSAdA',
      })
    ).toBeNull()

    // Malformed key rejection
    expect(
      buildPodcastEpisodeRoute({
        country: 'us',
        podcastId: '1234',
        episodeKey: 'too-short',
      })
    ).toBeNull()
  })

  it('keeps library deep-link contract path-only for history/favorites parity', () => {
    const historyRoute = buildPodcastEpisodeRoute({
      country: 'us',
      podcastId: '1234',
      episodeKey: 'dm8RLqvNEjRWeAfgXlSAdA',
    })
    const favoritesRoute = buildPodcastEpisodeRoute({
      country: 'us',
      podcastId: '1234',
      episodeKey: 'dm8RLqvNEjRWeAfgXlSAdA',
    })

    expect(historyRoute).toEqual(favoritesRoute)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildFavoriteKey,
  buildFavoriteKeyFromFavorite,
  favoriteMatchesIdentity,
} from '../favoriteIdentity'

describe('favoriteIdentity', () => {
  it('builds a canonical favorite key from podcastItunesId and episodeGuid', () => {
    expect(buildFavoriteKey('12345', 'episode-guid-1')).toBe('12345::episode-guid-1')
  })

  it('trims canonical favorite identity inputs before building the key', () => {
    expect(buildFavoriteKey(' 12345 ', ' episode-guid-1 ')).toBe('12345::episode-guid-1')
  })

  it('rebuilds a favorite key from a stored favorite record', () => {
    expect(
      buildFavoriteKeyFromFavorite({
        podcastItunesId: '12345',
        episodeGuid: 'episode-guid-1',
      })
    ).toBe('12345::episode-guid-1')
  })

  it('matches favorites by canonical identity only', () => {
    expect(
      favoriteMatchesIdentity(
        {
          id: 'fav-1',
          key: '12345::episode-guid-1',
          audioUrl: 'https://cdn.example.com/a.mp3',
          episodeTitle: 'Episode',
          podcastTitle: 'Podcast',
          artworkUrl: '',
          episodeArtworkUrl: '',
          description: 'Test',
          pubDate: 1738368000,
          durationSeconds: 0,
          addedAt: 1,
          podcastItunesId: '12345',
          episodeGuid: 'episode-guid-1',
          countryAtSave: 'us',
        },
        {
          podcastItunesId: '12345',
          episodeGuid: 'episode-guid-1',
        }
      )
    ).toBe(true)
  })
})

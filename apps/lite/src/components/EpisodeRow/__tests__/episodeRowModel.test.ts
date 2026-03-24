import { describe, expect, it, vi } from 'vitest'
import type { Favorite, PlaybackSession } from '@/lib/db/types'
import type { Episode, Podcast, SearchEpisode } from '@/lib/discovery'
import {
  fromEpisode,
  fromFavorite,
  fromPlaybackSession,
  fromSearchEpisode,
} from '../episodeRowModel'

vi.mock('@/lib/dateUtils', () => ({
  formatDateStandard: (value: string | number) => `DATE(${value})`,
  formatDuration: (seconds: number) => `DUR(${seconds})`,
  formatRelativeTime: (value: string) => `REL(${value})`,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/lib/htmlUtils', () => ({
  stripHtml: (value: string) => `CLEAN(${value})`,
}))

const t = ((key: string) => key) as never

describe('episodeRowModel', () => {
  it('maps podcast episode rows with canonical route + fallback artwork', () => {
    const podcast: Podcast = {
      providerPodcastId: 7,
      collectionName: 'Show',
      artistName: 'Host',
      artworkUrl100: 'cover-100',
      artworkUrl600: 'cover-600',
      feedUrl: 'feed',
      collectionViewUrl: '',
      genres: [],
    }
    const episode: Episode = {
      id: 'ep-1',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: '',
      duration: 120,
    }

    const model = fromEpisode({ episode, podcast, routeCountry: 'us', language: 'en', t })

    expect(model.route?.to).toBe('/$country/podcast/$id/episode/$episodeId')
    expect(model.route?.params).toEqual({
      country: 'us',
      id: '7',
      episodeId: expect.stringContaining('episode-1'),
    })
    expect(model.subtitle).toBe('REL(2025-01-01)')
    expect(model.description).toBe('CLEAN(<p>desc</p>)')
    expect(model.meta).toBe('DUR(120)')
    expect(model.artworkFallbackSrc).toBe('cover-600')
  })

  it('maps search rows with play label and subtitle composition', () => {
    const episode: SearchEpisode = {
      providerEpisodeId: 42,
      providerPodcastId: 9,
      episodeGuid: 'guid-42',
      trackName: 'Search Episode',
      collectionName: 'Search Show',
      artistName: 'Host',
      episodeUrl: 'audio',
      releaseDate: '2025-01-02',
      description: 'desc',
      artworkUrl100: 'art-100',
      artworkUrl600: 'art-600',
    }

    const model = fromSearchEpisode({ episode, routeCountry: 'us', language: 'en', t })
    expect(model.title).toBe('Search Episode')
    expect(model.subtitle).toBe('REL(2025-01-02) • Search Show')
    expect(model.playAriaLabel).toBe('ariaPlayEpisode')
    expect(model.route?.params.id).toBe('9')
  })

  it('maps favorites and keeps providerPodcastId fallback via subscription map', () => {
    const favorite = {
      id: 'fav-1',
      key: 'feed::audio',
      feedUrl: 'feed',
      audioUrl: 'audio',
      episodeTitle: 'Fav Episode',
      podcastTitle: 'Fav Show',
      artworkUrl: 'podcast-art',
      episodeArtworkUrl: 'episode-art',
      addedAt: 1,
      pubDate: '2025-02-01',
      durationSeconds: 180,
      episodeId: 'fav-ep',
      countryAtSave: 'us',
    } as Favorite

    const model = fromFavorite({
      favorite,
      subscriptionMap: new Map([['feed', 'map-podcast']]),
      language: 'en',
      t,
    })

    expect(model.route?.params.id).toBe('map-podcast')
    expect(model.subtitle).toBe('Fav Show • DATE(2025-02-01)')
    expect(model.artworkSrc).toBe('episode-art')
  })

  it('maps history sessions and keeps country/provider fallback route behavior', () => {
    const session = {
      id: 's1',
      source: 'explore',
      title: 'History Episode',
      createdAt: 1,
      lastPlayedAt: 1,
      sizeBytes: 0,
      durationSeconds: 240,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 10,
      audioFilename: '',
      subtitleFilename: '',
      podcastFeedUrl: 'feed',
      podcastTitle: 'History Show',
      publishedAt: 123,
      episodeId: 'history-ep',
      countryAtSave: 'us',
    } as PlaybackSession

    const model = fromPlaybackSession({
      session,
      subscriptionMap: new Map([['feed', 'from-map']]),
      artworkBlob: null,
      language: 'en',
      t,
    })

    expect(model.route?.params).toEqual({
      country: 'us',
      id: 'from-map',
      episodeId: expect.stringContaining('history-episode'),
    })
    expect(model.subtitle).toBe('History Show • DATE(123)')
    expect(model.meta).toBe('DUR(240)')
  })

  it('uses episodeUrl as fallback when guid and provider id missing for routing', () => {
    const episode = {
      providerEpisodeId: undefined,
      providerPodcastId: 900,
      episodeGuid: undefined,
      trackName: 'No ID Episode',
      episodeUrl: 'http://cdn/a.mp3',
    } as unknown as SearchEpisode

    const model = fromSearchEpisode({ episode, routeCountry: 'us', language: 'en', t })
    // Verify that episodeId contains the escaped URL as fallback
    expect(model.route?.params.episodeId).toContain('http')
    expect(model.route?.params.episodeId).toContain('no-id-episode')
  })
})

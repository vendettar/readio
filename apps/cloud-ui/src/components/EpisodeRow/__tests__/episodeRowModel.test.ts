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
      podcastItunesId: '7',
      title: 'Show',
      author: 'Host',
      image: 'cover-100',
      artwork: 'cover-600',
      feedUrl: 'feed',
      genres: [],
    }
    const episode: Episode = {
      id: 'a8343698-1dca-4c63-bb5d-3e2a61522c2a',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: '',
      duration: 120,
    }

    const model = fromEpisode({ episode, podcast, routeCountry: 'us', language: 'en', t })

    expect(model.route?.to).toBe('/podcast/$country/$id/$episodeKey')
    expect(model.route?.params).toEqual({
      country: 'us',
      id: '7',
      episodeKey: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
    })
    expect(model.subtitle).toBe('REL(2025-01-01)')
    expect(model.description).toBe('CLEAN(<p>desc</p>)')
    expect(model.meta).toBe('DUR(120)')
    expect(model.artworkFallbackSrc).toBe('cover-600')
  })

  it('uses podcastItunesId for editor pick episode routes and forwards the cached snapshot', () => {
    const editorPickSnapshot = {
      id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      name: 'The Daily',
      artistName: 'The New York Times',
      artworkUrl100: 'cover-100',
      url: 'https://www.nytimes.com/the-daily',
      genres: [],
      description: 'desc',
      feedUrl: 'https://feeds.simplecast.com/54nAGcIl',
      feedId: '75075',
      podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      podcastItunesId: '1200361736',
    }
    const podcast: Podcast = {
      podcastItunesId: '1200361736',
      collectionName: 'The Daily',
      artistName: 'The New York Times',
      artworkUrl100: 'cover-100',
      artworkUrl600: 'cover-600',
      feedUrl: 'https://feeds.simplecast.com/54nAGcIl',
      collectionViewUrl: '',
      genres: [],
      id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      editorPickSnapshot,
    } as Podcast
    const episode: Episode = {
      id: 'ep-1',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: '',
      duration: 120,
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
    }

    const model = fromEpisode({ episode, podcast, routeCountry: 'us', language: 'en', t })

    expect(model.route?.params).toEqual({
      country: 'us',
      id: '1200361736',
      episodeKey: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
    })
    expect(model.route?.state).toEqual({
      editorPickSnapshot,
    })
  })

  it('uses stable editor-pick episode id when episodeGuid is absent', () => {
    const editorPickSnapshot = {
      id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      name: 'The Daily',
      artistName: 'The New York Times',
      artworkUrl100: 'cover-100',
      url: 'https://www.nytimes.com/the-daily',
      genres: [],
      description: 'desc',
      feedUrl: 'https://feeds.simplecast.com/54nAGcIl',
      feedId: '75075',
      podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      podcastItunesId: '1200361736',
    }
    const podcast: Podcast = {
      podcastItunesId: '1200361736',
      collectionName: 'The Daily',
      artistName: 'The New York Times',
      artworkUrl100: 'cover-100',
      artworkUrl600: 'cover-600',
      feedUrl: 'https://feeds.simplecast.com/54nAGcIl',
      collectionViewUrl: '',
      genres: [],
      id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      editorPickSnapshot,
    } as Podcast
    const episode: Episode = {
      id: 'a8343698-1dca-4c63-bb5d-3e2a61522c2a',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: '',
      duration: 120,
    }

    const model = fromEpisode({ episode, podcast, routeCountry: 'us', language: 'en', t })

    expect(model.route?.params).toEqual({
      country: 'us',
      id: '1200361736',
      episodeKey: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
    })
    expect(model.route?.state).toEqual({
      editorPickSnapshot,
    })
  })

  it('maps search rows with play label and subtitle composition', () => {
    const episode: SearchEpisode = {
      id: 'episode-id-42',
      providerEpisodeId: '42',
      podcastItunesId: '9',
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      title: 'Search Episode',
      podcastTitle: 'Search Show',
      author: 'Host',
      episodeUrl: 'audio',
      releaseDate: '2025-01-02',
      description: 'desc',
      image: 'art-100',
      artwork: 'art-600',
    }

    const model = fromSearchEpisode({ episode, routeCountry: 'us', language: 'en', t })
    expect(model.title).toBe('Search Episode')
    expect(model.subtitle).toBe('REL(2025-01-02) • Search Show')
    expect(model.playAriaLabel).toBe('ariaPlayEpisode')
    expect(model.route?.params.id).toBe('9')
  })

  it('maps favorites and keeps podcastItunesId fallback via subscription map', () => {
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
      episodeId: '75f3241b-439d-4786-8968-07e05e548074',
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
      episodeId: '75f3241b-439d-4786-8968-07e05e548074',
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
      episodeKey: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
    })
    expect(model.subtitle).toBe('History Show • DATE(123)')
    expect(model.meta).toBe('DUR(240)')
  })

  it('returns null route when guid and provider id missing for routing', () => {
    const episode = {
      providerEpisodeId: undefined,
      podcastItunesId: '900',
      episodeGuid: undefined,
      trackName: 'No ID Episode',
      episodeUrl: 'http://cdn/a.mp3',
    } as unknown as SearchEpisode

    const model = fromSearchEpisode({ episode, routeCountry: 'us', language: 'en', t })
    // Verify that route is null because buildEpisodeCompactKey fails for undefined/empty strings
    expect(model.route).toBeNull()
  })
})

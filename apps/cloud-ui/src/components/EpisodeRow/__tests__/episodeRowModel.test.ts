import { describe, expect, it, vi } from 'vitest'
import type { Favorite, PlaybackSession } from '@/lib/db/types'
import type { FeedEpisode, Podcast, SearchEpisode } from '@/lib/discovery'
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
      artwork: 'https://example.com/cover-600.jpg',
      description: 'A show',
      feedUrl: 'https://example.com/feed.xml',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
      dead: false,
    }
    const episode: FeedEpisode = {
      episodeGuid: 'a8343698-1dca-4c63-bb5d-3e2a61522c2a',
      title: 'FeedEpisode 1',
      description: '<p>desc</p>',
      audioUrl: 'https://example.com/audio.mp3',
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
    expect(model.artworkFallbackSrc).toBe('https://example.com/cover-600.jpg')
  })

  it('returns null route when podcast lacks iTunes ID (fail closed, no GUID fallback)', () => {
    // Critical: GUID fallback is disabled - route fails closed
    const podcast: Podcast = {
      podcastItunesId: '',
      title: 'Show',
      author: 'Host',
      artwork: 'https://example.com/cover-600.jpg',
      description: 'A show',
      feedUrl: 'https://example.com/feed.xml',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
      dead: false,
    }
    const episode: FeedEpisode = {
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      title: 'FeedEpisode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: '',
      duration: 120,
    }

    const model = fromEpisode({ episode, podcast, routeCountry: 'us', language: 'en', t })

    expect(model.route).toBeNull()
  })

  it('uses podcastItunesId for editor pick episode routes and forwards the cached snapshot', () => {
    const editorPickSnapshot = {
      id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      title: 'The Daily',
      author: 'The New York Times',
      artwork: 'cover-100',
      link: 'https://www.nytimes.com/the-daily',
      genres: [],
      description: 'desc',
      feedUrl: 'https://feeds.simplecast.com/54nAGcIl',
      podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      podcastItunesId: '1200361736',
    }
    const podcast: Podcast = {
      podcastItunesId: '1200361736',
      title: 'The Daily',
      author: 'The New York Times',
      artwork: 'cover-600',
      feedUrl: 'https://feeds.simplecast.com/54nAGcIl',
      description: 'Description',
      lastUpdateTime: 1700000000000,
      episodeCount: 100,
      language: 'en',
      genres: ['News'],
      dead: false,
    }
    const episode: FeedEpisode = {
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      title: 'FeedEpisode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: '',
      duration: 120,
    }

    const model = fromEpisode({
      episode,
      podcast,
      editorPickSnapshot,
      routeCountry: 'us',
      language: 'en',
      t,
    })

    expect(model.route?.params).toEqual({
      country: 'us',
      id: '1200361736',
      episodeKey: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
    })
    expect(model.route?.state).toEqual({
      editorPickSnapshot,
    })
  })

  it('returns null route when feed episodeGuid is absent', () => {
    const editorPickSnapshot = {
      id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      title: 'The Daily',
      author: 'The New York Times',
      artwork: 'cover-100',
      link: 'https://www.nytimes.com/the-daily',
      genres: [],
      description: 'desc',
      feedUrl: 'https://feeds.simplecast.com/54nAGcIl',
      podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      podcastItunesId: '1200361736',
    }
    const podcast: Podcast = {
      podcastItunesId: '1200361736',
      title: 'The Daily',
      author: 'The New York Times',
      artwork: 'cover-600',
      feedUrl: 'https://feeds.simplecast.com/54nAGcIl',
      description: 'Description',
      lastUpdateTime: 1700000000000,
      episodeCount: 100,
      language: 'en',
      genres: ['News'],
      dead: false,
    }
    const episode: FeedEpisode = {
      title: 'FeedEpisode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: '',
      duration: 120,
    }

    const model = fromEpisode({
      episode,
      podcast,
      editorPickSnapshot,
      routeCountry: 'us',
      language: 'en',
      t,
    })

    expect(model.route).toBeNull()
  })

  it('maps search rows with play label and subtitle composition', () => {
    const episode: SearchEpisode = {
      podcastItunesId: '9',
      title: 'Search FeedEpisode',
      showTitle: 'Search Show',
      episodeUrl: 'audio',
      episodeGuid: 'search-guid-1',
      releaseDate: '2025-01-02',
      trackTimeMillis: 61000,
      shortDescription: 'desc',
      artwork: 'art-600',
    }

    const model = fromSearchEpisode({ episode, routeCountry: 'us', language: 'en', t })
    expect(model.title).toBe('Search FeedEpisode')
    expect(model.subtitle).toBe('REL(2025-01-02) • Search Show')
    expect(model.description).toBe('CLEAN(desc)')
    expect(model.playAriaLabel).toBe('ariaPlayEpisode')
    expect(model.route).toBeNull()
  })

  it('maps favorites and keeps podcastItunesId fallback via subscription map', () => {
    const favorite = {
      id: 'fav-1',
      key: 'feed::audio',
      feedUrl: 'feed',
      audioUrl: 'audio',
      episodeTitle: 'Fav FeedEpisode',
      podcastTitle: 'Fav Show',
      artworkUrl: 'podcast-art',
      episodeArtworkUrl: 'episode-art',
      addedAt: 1,
      pubDate: '2025-02-01',
      durationSeconds: 180,
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
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
      title: 'History FeedEpisode',
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
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
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
      podcastItunesId: '900',
      title: 'No ID Episode',
      episodeUrl: 'http://cdn/a.mp3',
    } as unknown as SearchEpisode

    const model = fromSearchEpisode({ episode, routeCountry: 'us', language: 'en', t })
    expect(model.route).toBeNull()
  })
})

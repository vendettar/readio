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
      artwork: 'https://example.com/cover-600.jpg',
      description: 'A show',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
    }
    const episode: Episode = {
      guid: 'a8343698-1dca-4c63-bb5d-3e2a61522c2a',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'https://example.com/audio.mp3',
      pubDate: '2025-01-01',
      artworkUrl: 'https://example.com/episode-1.jpg',
      fileSize: 1024,
      duration: 120,
      explicit: false,
      link: 'https://example.com/episodes/1',
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
    expect(model.downloadArgs).toEqual({
      episodeTitle: 'Episode 1',
      showTitle: 'Show',
      audioUrl: 'https://example.com/audio.mp3',
      transcriptUrl: undefined,
      artworkUrl: 'https://example.com/episode-1.jpg',
      countryAtSave: 'us',
      podcastItunesId: '7',
      episodeGuid: 'a8343698-1dca-4c63-bb5d-3e2a61522c2a',
      durationSeconds: 120,
    })
  })

  it('returns null route when podcast lacks iTunes ID (fail closed, no GUID fallback)', () => {
    // Critical: GUID fallback is disabled - route fails closed
    const podcast: Podcast = {
      podcastItunesId: '',
      title: 'Show',
      author: 'Host',
      artwork: 'https://example.com/cover-600.jpg',
      description: 'A show',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
    }
    const episode: Episode = {
      guid: '75f3241b-439d-4786-8968-07e05e548074',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: 'https://example.com/episode-2.jpg',
      fileSize: 1024,
      duration: 120,
      explicit: false,
      link: 'https://example.com/episodes/fail-closed',
    }

    const model = fromEpisode({ episode, podcast, routeCountry: 'us', language: 'en', t })

    expect(model.route).toBeNull()
  })

  it('trims canonical route identity before building episode routes', () => {
    const podcast: Podcast = {
      podcastItunesId: ' 7 ',
      title: 'Show',
      author: 'Host',
      artwork: 'https://example.com/cover-600.jpg',
      description: 'A show',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
    }
    const episode: Episode = {
      guid: ' a8343698-1dca-4c63-bb5d-3e2a61522c2a ',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'https://example.com/audio.mp3',
      pubDate: '2025-01-01',
      artworkUrl: 'https://example.com/episode-1.jpg',
      fileSize: 1024,
      duration: 120,
      explicit: false,
      link: 'https://example.com/episodes/1',
    }

    const model = fromEpisode({ episode, podcast, routeCountry: 'us', language: 'en', t })

    expect(model.route?.params.id).toBe('7')
    expect(model.route?.to).toBe('/podcast/$country/$id/$episodeKey')
    if (model.route?.to !== '/podcast/$country/$id/$episodeKey') {
      throw new Error('expected canonical episode route')
    }
    expect(model.route.params.episodeKey).toBe('qDQ2mB3KTGO7XT4qYVIsKg')
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
      podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      podcastItunesId: '1200361736',
      lastUpdateTime: 1700000000000,
      episodeCount: 100,
    }
    const podcast: Podcast = {
      podcastItunesId: '1200361736',
      title: 'The Daily',
      author: 'The New York Times',
      artwork: 'cover-600',
      description: 'Description',
      lastUpdateTime: 1700000000000,
      episodeCount: 100,
      language: 'en',
      genres: ['News'],
    }
    const episode: Episode = {
      guid: '75f3241b-439d-4786-8968-07e05e548074',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: 'https://example.com/episode-3.jpg',
      fileSize: 1024,
      duration: 120,
      explicit: false,
      link: 'https://example.com/episodes/editor-pick',
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
    expect(model.route).toMatchObject({
      state: {
        editorPickSnapshot,
      },
    })
  })

  it('returns null route when guid is absent', () => {
    const editorPickSnapshot = {
      id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      title: 'The Daily',
      author: 'The New York Times',
      artwork: 'cover-100',
      link: 'https://www.nytimes.com/the-daily',
      genres: [],
      description: 'desc',
      podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      podcastItunesId: '1200361736',
      lastUpdateTime: 1700000000000,
      episodeCount: 100,
    }
    const podcast: Podcast = {
      podcastItunesId: '1200361736',
      title: 'The Daily',
      author: 'The New York Times',
      artwork: 'cover-600',
      description: 'Description',
      lastUpdateTime: 1700000000000,
      episodeCount: 100,
      language: 'en',
      genres: ['News'],
    }
    const episode: Episode = {
      guid: '',
      title: 'Episode 1',
      description: '<p>desc</p>',
      audioUrl: 'audio',
      pubDate: '2025-01-01',
      artworkUrl: 'https://example.com/episode-4.jpg',
      fileSize: 1024,
      duration: 120,
      explicit: false,
      link: 'https://example.com/episodes/missing-guid',
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
      title: 'Search Episode',
      showTitle: 'Search Show',
      audioUrl: 'audio',
      guid: 'search-guid-1',
      releaseDate: '2025-01-02',
      trackTimeMillis: 61000,
      shortDescription: 'desc',
      artwork: 'art-600',
    } as SearchEpisode

    const model = fromSearchEpisode({ episode, routeCountry: 'us', language: 'en', t })
    expect(model.title).toBe('Search Episode')
    expect(model.subtitle).toBe('REL(2025-01-02) • Search Show')
    expect(model.description).toBe('CLEAN(desc)')
    expect(model.playAriaLabel).toBe('ariaPlayEpisode')
    expect(model.route).not.toBeNull()
    expect(model.route?.to).toBe('/podcast/$country/$id/$episodeKey')
    expect(model.route?.params.country).toBe('us')
    expect(model.route?.params.id).toBe('9')
    expect(model.route?.state).toBeUndefined()
    expect(model.downloadArgs).toEqual({
      episodeTitle: 'Search Episode',
      showTitle: 'Search Show',
      audioUrl: 'audio',
      artworkUrl: 'art-600',
      countryAtSave: 'us',
      podcastItunesId: '9',
      episodeGuid: 'search-guid-1',
      durationSeconds: 61,
    })
    if (model.route?.to === '/podcast/$country/$id/$episodeKey') {
      expect(model.route.params.episodeKey).toBe('e_c2VhcmNoLWd1aWQtMQ')
    }
  })

  it('does not expose canonical downloadArgs when search row lacks route country', () => {
    const episode: SearchEpisode = {
      podcastItunesId: '9',
      title: 'Search Episode',
      showTitle: 'Search Show',
      audioUrl: 'audio',
      guid: 'search-guid-1',
      artwork: 'art-600',
    } as SearchEpisode

    const model = fromSearchEpisode({ episode, language: 'en', t })

    expect(model.downloadArgs).toBeUndefined()
  })

  it('maps favorites using the persisted podcastItunesId only', () => {
    const favorite: Favorite = {
      id: 'fav-1',
      key: 'fav-podcast::75f3241b-439d-4786-8968-07e05e548074',
      audioUrl: 'audio',
      episodeTitle: 'Fav Episode',
      podcastTitle: 'Fav Show',
      artworkUrl: 'podcast-art',
      episodeArtworkUrl: 'episode-art',
      addedAt: 1,
      pubDate: '2025-02-01',
      durationSeconds: 180,
      description: 'Test description',
      podcastItunesId: 'fav-podcast',
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      countryAtSave: 'us',
    }

    const model = fromFavorite({
      favorite,
      language: 'en',
      t,
    })

    expect(model.route?.params.id).toBe('fav-podcast')
    expect(model.subtitle).toBe('Fav Show • DATE(2025-02-01)')
    expect(model.artworkSrc).toBe('episode-art')
    expect(model.description).toBe('CLEAN(Test description)')
    expect(model.downloadArgs).toEqual({
      episodeTitle: 'Fav Episode',
      showTitle: 'Fav Show',
      audioUrl: 'audio',
      transcriptUrl: undefined,
      artworkUrl: 'episode-art',
      countryAtSave: 'us',
      podcastItunesId: 'fav-podcast',
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      durationSeconds: 180,
    })
  })

  it('keeps persisted favorite description and episode artwork without podcast-art fallback', () => {
    const favorite: Favorite = {
      id: 'fav-2',
      key: 'fav-podcast::75f3241b-439d-4786-8968-07e05e548074',
      audioUrl: 'audio',
      episodeTitle: 'Fav Episode',
      podcastTitle: 'Fav Show',
      artworkUrl: 'podcast-art',
      episodeArtworkUrl: 'episode-art',
      addedAt: 1,
      pubDate: '2025-02-01',
      durationSeconds: 180,
      description: '',
      podcastItunesId: 'fav-podcast',
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      countryAtSave: 'us',
    }

    const model = fromFavorite({ favorite, language: 'en', t })

    expect(model.artworkSrc).toBe('episode-art')
    expect(model.artworkFallbackSrc).toBe('podcast-art')
    expect(model.description).toBe('CLEAN()')
  })

  it('maps history sessions using the persisted podcastItunesId only', () => {
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
      audioUrl: 'https://example.com/history.mp3',
      artworkUrl: 'https://example.com/history.jpg',
      podcastItunesId: 'session-podcast',
      showTitle: 'History Show',
      publishedAt: 123,
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      countryAtSave: 'us',
    } as PlaybackSession

    const model = fromPlaybackSession({
      session,
      artworkBlob: null,
      language: 'en',
      t,
    })

    expect(model.route?.params).toEqual({
      country: 'us',
      id: 'session-podcast',
      episodeKey: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
    })
    expect(model.subtitle).toBe('History Show • DATE(123)')
    expect(model.meta).toBe('DUR(240)')
    expect(model.downloadArgs).toEqual({
      episodeTitle: 'History Episode',
      showTitle: 'History Show',
      audioUrl: 'https://example.com/history.mp3',
      transcriptUrl: undefined,
      artworkUrl: 'https://example.com/history.jpg',
      countryAtSave: 'us',
      podcastItunesId: 'session-podcast',
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      durationSeconds: 240,
    })
  })

  it('does not expose downloadArgs for non-canonical history sessions', () => {
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
      audioUrl: 'https://example.com/history.mp3',
      artworkUrl: 'https://example.com/history.jpg',
      podcastItunesId: '   ',
      showTitle: 'History Show',
      publishedAt: 123,
      episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      countryAtSave: 'us',
    } as PlaybackSession

    const model = fromPlaybackSession({
      session,
      artworkBlob: null,
      language: 'en',
      t,
    })

    expect(model.downloadArgs).toBeUndefined()
  })

  it('keeps canonical search row titles without empty-string coercion', () => {
    const episode: SearchEpisode = {
      podcastItunesId: '901',
      title: 'Canonical Search Episode',
      showTitle: 'Canonical Search Show',
      audioUrl: 'http://cdn.example.com/canonical.mp3',
      guid: 'search-guid-2',
      artwork: 'http://cdn.example.com/canonical-art.jpg',
      releaseDate: '2026-03-27T00:00:00Z',
      shortDescription: 'Canonical search summary',
    }

    const model = fromSearchEpisode({ episode, routeCountry: 'us', language: 'en', t })

    expect(model.title).toBe('Canonical Search Episode')
    expect(model.subtitle).toContain('Canonical Search Show')
    expect(model.downloadArgs?.showTitle).toBe('Canonical Search Show')
  })
})

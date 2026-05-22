import { describe, expect, it } from 'vitest'
import { buildPodcastEpisodesPagesQueryKey } from '../podcastQueryContract'
import {
  EditorPickPodcastSchema,
  PIEpisodeSchema,
  PIPodcastSchema,
  PodcastEpisodesSchema,
  SearchEpisodeSchema,
  SearchPodcastSchema,
  TopEpisodeSchema,
} from '../schema'
import { makePodcastEpisodes } from './fixtures'

describe('discovery schema PI podcast contract', () => {
  it('parses PI podcasts without feedUrl', () => {
    const podcast = PIPodcastSchema.parse({
      podcastItunesId: '123',
      title: 'Podcast',
      author: 'Host',
      artwork: 'https://example.com/art.jpg',
      description: 'desc',
      lastUpdateTime: 1,
      episodeCount: 10,
      language: 'en',
      genres: ['Technology'],
    })

    expect(podcast.podcastItunesId).toBe('123')
  })

  it('parses editor-pick podcasts without feedUrl', () => {
    const podcast = EditorPickPodcastSchema.parse({
      podcastItunesId: '123',
      title: 'Podcast',
      author: 'Host',
      artwork: 'https://example.com/art.jpg',
      description: 'desc',
      lastUpdateTime: 1,
      episodeCount: 10,
      language: 'en',
      genres: ['Technology'],
    })

    expect(podcast.podcastItunesId).toBe('123')
  })

  it('builds podcast-keyed episode query keys for page rendering', () => {
    expect(buildPodcastEpisodesPagesQueryKey('123')).toEqual(['podcast', 'episodes-pages', '123'])
  })

  it('builds country-scoped podcast episode query keys for page rendering when route authority exists', () => {
    expect(buildPodcastEpisodesPagesQueryKey('123', 'jp')).toEqual([
      'podcast',
      'episodes-pages',
      '123',
      'country-jp',
    ])
  })

  it('parses search episodes with guid as the wire identity field', () => {
    const episode = SearchEpisodeSchema.parse({
      podcastItunesId: '123',
      title: 'Episode 1',
      showTitle: 'Show 1',
      shortDescription: 'desc',
      artwork: 'https://example.com/art.jpg',
      audioUrl: 'https://example.com/audio.mp3',
      guid: 'search-guid-1',
      releaseDate: '2026-03-27T00:00:00.000Z',
    })

    expect(episode.guid).toBe('search-guid-1')
    expect(episode.audioUrl).toBe('https://example.com/audio.mp3')
  })

  it('rejects search episodes when releaseDate is missing', () => {
    expect(() =>
      SearchEpisodeSchema.parse({
        podcastItunesId: '123',
        title: 'Episode 1',
        showTitle: 'Show 1',
        artwork: 'https://example.com/art.jpg',
        audioUrl: 'https://example.com/audio.mp3',
        guid: 'search-guid-1',
      })
    ).toThrow()
  })

  it('rejects search podcasts when releaseDate is missing', () => {
    expect(() =>
      SearchPodcastSchema.parse({
        podcastItunesId: '123',
        title: 'Podcast',
        author: 'Host',
        artwork: 'https://example.com/art.jpg',
        episodeCount: 10,
        genres: ['Technology'],
      })
    ).toThrow()
  })

  it('keeps PI fileSize as a non-rendering transport field alongside required duration', () => {
    const episode = PIEpisodeSchema.parse({
      guid: 'ep-1',
      title: 'Episode 1',
      description: 'Plain description',
      audioUrl: 'https://example.com/audio.mp3',
      pubDate: 1774569600,
      artworkUrl: 'https://example.com/art.jpg',
      duration: 54,
      explicit: false,
      link: 'https://example.com/episode-1',
      transcriptUrl: 'https://example.com/transcript.srt',
      fileSize: 1024,
    })

    expect(episode.duration).toBe(54)
    expect(episode.fileSize).toBe(1024)
    expect(episode.pubDate).toBe(1774569600)
  })

  it('rejects page-rendering episodes when duration is missing', () => {
    expect(() =>
      PIEpisodeSchema.parse({
        guid: 'ep-1',
        title: 'Episode 1',
        description: 'Plain description',
        audioUrl: 'https://example.com/audio.mp3',
        pubDate: 1774569600,
        artworkUrl: 'https://example.com/art.jpg',
        fileSize: 1024,
        explicit: false,
        link: 'https://example.com/episode-1',
      })
    ).toThrow()
  })

  it('rejects page-rendering episodes when fileSize is missing', () => {
    expect(() =>
      PIEpisodeSchema.parse({
        guid: 'ep-1',
        title: 'Episode 1',
        description: 'Plain description',
        audioUrl: 'https://example.com/audio.mp3',
        pubDate: 1774569600,
        artworkUrl: 'https://example.com/art.jpg',
        duration: 54,
        explicit: false,
        link: 'https://example.com/episode-1',
      })
    ).toThrow()
  })

  it('rejects page-rendering episodes when artworkUrl is missing', () => {
    expect(() =>
      PIEpisodeSchema.parse({
        guid: 'ep-1',
        title: 'Episode 1',
        description: 'Plain description',
        audioUrl: 'https://example.com/audio.mp3',
        pubDate: 1774569600,
        duration: 54,
        fileSize: 1024,
        explicit: false,
        link: 'https://example.com/episode-1',
      })
    ).toThrow()
  })

  it('keeps nullable PI optionals nullable in the canonical page contract', () => {
    const episode = PIEpisodeSchema.parse({
      guid: 'ep-1',
      title: 'Episode 1',
      description: 'Plain description',
      audioUrl: 'https://example.com/audio.mp3',
      pubDate: 1774569600,
      artworkUrl: 'https://example.com/art.jpg',
      fileSize: 1024,
      duration: 54,
      explicit: true,
      link: 'https://example.com/episode-1',
    })

    expect(episode.seasonNumber).toBeUndefined()
    expect(episode.episodeNumber).toBeUndefined()
    expect(episode.episodeType).toBeUndefined()
    expect(episode.transcriptUrl).toBeUndefined()
  })

  it('keeps zero-valued season and episode ordinals when PI emits them', () => {
    const episode = PIEpisodeSchema.parse({
      guid: 'ep-1',
      title: 'Episode 1',
      description: 'Plain description',
      audioUrl: 'https://example.com/audio.mp3',
      pubDate: 1774569600,
      artworkUrl: 'https://example.com/art.jpg',
      fileSize: 1024,
      duration: 54,
      explicit: true,
      link: 'https://example.com/episode-1',
      seasonNumber: 0,
      episodeNumber: 0,
    })

    expect(episode.seasonNumber).toBe(0)
    expect(episode.episodeNumber).toBe(0)
  })

  it('rejects RFC3339 string PI pubDate values at the schema boundary', () => {
    expect(() =>
      PIEpisodeSchema.parse({
        guid: 'ep-1',
        title: 'Episode 1',
        description: 'Plain description',
        audioUrl: 'https://example.com/audio.mp3',
        pubDate: '2026-03-27T00:00:00.000Z',
        artworkUrl: 'https://example.com/art.jpg',
        fileSize: 1024,
        duration: 54,
        explicit: true,
        link: 'https://example.com/episode-1',
      })
    ).toThrow()
  })

  it('rejects invalid numeric PI pubDate values', () => {
    const baseEpisode = {
      guid: 'ep-1',
      title: 'Episode 1',
      description: 'Plain description',
      audioUrl: 'https://example.com/audio.mp3',
      artworkUrl: 'https://example.com/art.jpg',
      fileSize: 1024,
      duration: 54,
      explicit: true,
      link: 'https://example.com/episode-1',
    }

    expect(() =>
      PIEpisodeSchema.parse({
        ...baseEpisode,
        pubDate: -1,
      })
    ).toThrow()

    expect(() =>
      PIEpisodeSchema.parse({
        ...baseEpisode,
        pubDate: 1774569600.5,
      })
    ).toThrow()
  })

  it('rejects non-http external urls in the PI page-rendering episode contract', () => {
    expect(() =>
      PIEpisodeSchema.parse({
        guid: 'ep-1',
        title: 'Episode 1',
        description: 'Plain description',
        audioUrl: 'https://example.com/audio.mp3',
        pubDate: 1774569600,
        artworkUrl: 'https://example.com/art.jpg',
        fileSize: 1024,
        duration: 54,
        explicit: true,
        link: 'javascript:alert(1)',
      })
    ).toThrow()
  })

  it('allows missing link field in PI episode contract', () => {
    const episode = PIEpisodeSchema.parse({
      guid: 'ep-1',
      title: 'Episode 1',
      description: 'Plain description',
      audioUrl: 'https://example.com/audio.mp3',
      pubDate: 1774569600,
      artworkUrl: 'https://example.com/art.jpg',
      fileSize: 1024,
      duration: 54,
      explicit: true,
      // link missing
    })

    expect(episode.link).toBeUndefined()
  })

  it('parses the active paginated SQLite episode-list contract', () => {
    const paginated = PodcastEpisodesSchema.parse({
      episodes: [
        {
          guid: 'ep-1',
          title: 'Episode 1',
          description: 'Plain description',
          audioUrl: 'https://example.com/audio.mp3',
          pubDate: 1774569600,
          artworkUrl: 'https://example.com/art.jpg',
          fileSize: 1024,
          duration: 54,
          explicit: false,
          link: 'https://example.com/episode-1',
        },
      ],
      limit: 20,
      offset: 40,
      nextOffset: 60,
      hasMore: true,
      storedTotal: 1000,
      isTruncated: true,
      lastSuccessfulFetchAt: 1779062400,
      nextRefreshAfter: 1779069600,
    })

    expect(paginated).toMatchObject({
      limit: 20,
      offset: 40,
      nextOffset: 60,
      hasMore: true,
      storedTotal: 1000,
      isTruncated: true,
      lastSuccessfulFetchAt: 1779062400,
      nextRefreshAfter: 1779069600,
    })
  })

  it('keeps the paginated episode-list schema strict about pagination metadata', () => {
    expect(() =>
      PodcastEpisodesSchema.parse({
        episodes: [],
        limit: 20,
        offset: 0,
        hasMore: false,
        storedTotal: 0,
        isTruncated: false,
      })
    ).toThrow()

    expect(() =>
      PodcastEpisodesSchema.parse(
        makePodcastEpisodes({
          limit: 0,
        })
      )
    ).toThrow()
  })

  it('keeps snapshot metadata optional while validating Unix timestamp shape when present', () => {
    const withoutSnapshotMetadata = PodcastEpisodesSchema.parse({
      episodes: [],
      limit: 20,
      offset: 0,
      nextOffset: 0,
      hasMore: false,
      storedTotal: 0,
      isTruncated: false,
    })

    expect(withoutSnapshotMetadata.lastSuccessfulFetchAt).toBeUndefined()
    expect(withoutSnapshotMetadata.nextRefreshAfter).toBeUndefined()
    const invalidSnapshotMetadataPayload: unknown = {
      ...makePodcastEpisodes(),
      lastSuccessfulFetchAt: '2026-05-18T00:00:00Z',
    }
    expect(() => PodcastEpisodesSchema.parse(invalidSnapshotMetadataPayload)).toThrow()
  })

  it('uses author for top-episode creator labels', () => {
    const episode = TopEpisodeSchema.parse({
      podcastItunesId: '123',
      title: 'Episode',
      author: 'The New York Times',
      artwork: 'https://example.com/art.jpg',
      genres: ['Technology'],
    })

    expect(episode.author).toBe('The New York Times')
  })
})

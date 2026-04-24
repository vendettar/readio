import type {
  EditorPickPodcast,
  FeedEpisode,
  ParsedFeed,
  Podcast,
  SearchEpisode,
  SearchPodcast,
  TopEpisode,
  TopPodcast,
} from '../schema'

export function makeMinimalPodcast(
  overrides: Partial<Podcast> = {}
): Podcast {
  return {
    podcastItunesId: 'podcast-123',
    title: 'Minimal Podcast',
    author: 'Host',
    artwork: 'https://example.com/podcast-600.jpg',
    description: 'A podcast',
    feedUrl: 'https://example.com/feed.xml',
    genres: [],
    ...overrides,
  }
}

export function makeSearchPodcast(
  overrides: Partial<SearchPodcast> = {}
): SearchPodcast {
  return {
    podcastItunesId: 'podcast-123',
    title: 'Tech Podcast',
    author: 'Host',
    artwork: 'https://example.com/tech-600.jpg',
    releaseDate: '2026-03-27T00:00:00.000Z',
    episodeCount: 321,
    genres: ['Technology'],
    ...overrides,
  }
}

export function makeSearchEpisode(
  overrides: Partial<SearchEpisode> = {}
): SearchEpisode {
  return {
    podcastItunesId: 'podcast-123',
    title: 'Episode Name',
    showTitle: 'Show Name',
    artwork: 'https://example.com/episode-600.jpg',
    episodeUrl: 'https://example.com/audio.mp3',
    episodeGuid: 'guid-episode-123',
    releaseDate: '2026-03-27T00:00:00.000Z',
    trackTimeMillis: 1800000,
    shortDescription: 'Episode summary',
    ...overrides,
  }
}

export function makeFeedEpisode(
  overrides: Partial<FeedEpisode> = {}
): FeedEpisode {
  return {
    episodeGuid: 'feed-episode-guid-1',
    title: 'Feed Episode',
    description: 'Feed episode description',
    audioUrl: 'https://example.com/feed-audio.mp3',
    pubDate: '2026-03-27T00:00:00.000Z',
    artworkUrl: 'https://example.com/feed-episode-art.jpg',
    duration: 1800,
    ...overrides,
  }
}

export function makeParsedFeed(
  overrides: Partial<ParsedFeed> = {}
): ParsedFeed {
  return {
    title: 'Cloud Feed Podcast',
    description: 'Backend-owned feed',
    artworkUrl: 'https://example.com/feed-art.jpg',
    pageInfo: undefined,
    episodes: [makeFeedEpisode()],
    ...overrides,
  }
}

export function makePodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    ...makeMinimalPodcast({
      podcastItunesId: '123',
      title: 'Cloud Feed Podcast',
      artwork: 'https://example.com/art-600.jpg',
      feedUrl: 'https://example.com/feed.xml',
    }),
    lastUpdateTime: 1613394044,
    episodeCount: 50,
    language: 'en',
    genres: ['Technology'],
    ...overrides,
  }
}

export function makeEditorPickPodcast(
  overrides: Partial<EditorPickPodcast> = {}
): EditorPickPodcast {
  return {
    ...makePodcast({
      title: 'Editor Pick Podcast',
      artwork: 'https://example.com/editor-pick-600.jpg',
    }),
    ...overrides,
  }
}

export function makeEditorPickSnapshot(
  overrides: Partial<EditorPickPodcast> = {}
): EditorPickPodcast {
  return makeEditorPickPodcast(overrides)
}

export function makeTopPodcast(
  overrides: Partial<TopPodcast> = {}
): TopPodcast {
  return {
    podcastItunesId: 'top-1',
    title: 'Top Show',
    author: 'Host',
    artwork: 'https://example.com/top-1.jpg',
    genres: ['Arts'],
    ...overrides,
  }
}

export function makeTopEpisode(
  overrides: Partial<TopEpisode> = {}
): TopEpisode {
  return {
    podcastItunesId: '123',
    title: 'Top Episode',
    author: 'Host',
    artwork: 'https://example.com/top-ep-1.jpg',
    genres: ['Technology'],
    ...overrides,
  }
}

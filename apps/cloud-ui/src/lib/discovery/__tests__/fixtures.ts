import type {
  EditorPickPodcast,
  Episode,
  Podcast,
  PodcastEpisodes,
  SearchEpisode,
  SearchPodcast,
  TopEpisode,
  TopPodcast,
} from '../schema'

export function makeMinimalPodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    podcastItunesId: 'podcast-123',
    title: 'Minimal Podcast',
    author: 'Host',
    artwork: 'https://example.com/podcast-600.jpg',
    description: 'A podcast',
    lastUpdateTime: 1613394044,
    episodeCount: 50,
    genres: [],
    ...overrides,
  }
}

export function makeSearchPodcast(overrides: Partial<SearchPodcast> = {}): SearchPodcast {
  return {
    podcastItunesId: 'podcast-123',
    title: 'Tech Podcast',
    author: 'Host',
    artwork: 'https://example.com/tech-600.jpg',
    releaseDate: '2026-03-27T00:00:00Z',
    episodeCount: 321,
    genres: ['Technology'],
    ...overrides,
  }
}

export function makeSearchEpisode(
  overrides: Partial<SearchEpisode> & { guid?: string } = {}
): SearchEpisode {
  return {
    podcastItunesId: 'podcast-123',
    title: 'Episode Name',
    showTitle: 'Show Name',
    artwork: 'https://example.com/episode-600.jpg',
    audioUrl: 'https://example.com/audio.mp3',
    guid: 'guid-episode-123',
    releaseDate: '2026-03-27T00:00:00Z',
    trackTimeMillis: 1800000,
    shortDescription: 'Episode summary',
    ...overrides,
  } as SearchEpisode
}

export function makeEpisode(overrides: Partial<Episode> & { guid?: string } = {}): Episode {
  return {
    guid: 'discovery-episode-guid-1',
    title: 'Discovery Episode',
    description: 'Discovery episode description',
    audioUrl: 'https://example.com/discovery-audio.mp3',
    pubDate: '2026-03-27T00:00:00Z',
    artworkUrl: 'https://example.com/discovery-episode-art.jpg',
    fileSize: 1024,
    duration: 1800,
    explicit: false,
    link: 'https://example.com/discovery-episode',
    ...overrides,
  } as Episode
}

export function makePodcastEpisodes(overrides: Partial<PodcastEpisodes> = {}): PodcastEpisodes {
  return {
    episodes: [makeEpisode()],
    ...overrides,
  }
}

export function makePodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    ...makeMinimalPodcast({
      podcastItunesId: '123',
      title: 'Cloud Feed Podcast',
      artwork: 'https://example.com/art-600.jpg',
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

export function makeTopPodcast(overrides: Partial<TopPodcast> = {}): TopPodcast {
  return {
    podcastItunesId: 'top-1',
    title: 'Top Show',
    author: 'Host',
    artwork: 'https://example.com/top-1.jpg',
    genres: ['Arts'],
    ...overrides,
  }
}

export function makeTopEpisode(overrides: Partial<TopEpisode> = {}): TopEpisode {
  return {
    podcastItunesId: '123',
    title: 'Top Episode',
    author: 'The New York Times',
    artwork: 'https://example.com/top-ep-1.jpg',
    genres: ['Technology'],
    ...overrides,
  }
}

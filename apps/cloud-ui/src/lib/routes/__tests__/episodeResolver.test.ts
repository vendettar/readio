import type { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import discovery, { type Episode, type Podcast, type PodcastEpisodes } from '@/lib/discovery'
import {
  buildSearchEpisodeRoute,
  resolveEpisodeByTitle,
  tryDirectEpisodeRoute,
  trySearchEpisodeDirectRoute,
} from '../episodeResolver'

const MOCK_GUID = '766f112e-abcd-1234-5678-07e05e548074'
type MockQueryClient = QueryClient & {
  fetchQuery: ReturnType<typeof vi.fn>
  getQueryData: ReturnType<typeof vi.fn>
}

function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

function createMockPodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    title: 'Test Podcast',
    author: 'Test Author',
    artwork: 'https://example.com/artwork.jpg',
    description: 'A test podcast',
    lastUpdateTime: 1700000000,
    podcastItunesId: '123456789',
    episodeCount: 100,
    language: 'en',
    genres: ['Technology'],
    ...overrides,
  }
}

function createMockEpisode(overrides: Partial<Episode> & { guid?: string } = {}): Episode {
  return {
    title: 'Episode 1: The Beginning',
    description: 'Description',
    audioUrl: 'https://example.com/ep1.mp3',
    pubDate: unixSeconds(new Date()),
    guid: MOCK_GUID,
    duration: 60,
    explicit: false,
    link: 'https://example.com/episodes/1',
    ...overrides,
  } as Episode
}

function createMockPodcastEpisodes(episodes: Episode[]): PodcastEpisodes {
  const result: PodcastEpisodes = {
    episodes,
    limit: 20,
    offset: 0,
    nextOffset: episodes.length,
    hasMore: false,
    storedTotal: episodes.length,
    isTruncated: false,
  }
  vi.spyOn(discovery, 'fetchPodcastEpisodes').mockResolvedValue(result)
  return result
}

function createMockPodcastEpisodePages(pages: PodcastEpisodes[]): void {
  const fetchEpisodes = vi.spyOn(discovery, 'fetchPodcastEpisodes')
  for (const page of pages) {
    fetchEpisodes.mockResolvedValueOnce(page)
  }
}

function createMockPodcastEpisodePage(
  episodes: Episode[],
  overrides: Partial<PodcastEpisodes> = {}
): PodcastEpisodes {
  return {
    episodes,
    limit: 20,
    offset: 0,
    nextOffset: episodes.length,
    hasMore: false,
    storedTotal: episodes.length,
    isTruncated: false,
    ...overrides,
  }
}

function createMockQueryClient(): MockQueryClient {
  return {
    fetchQuery: vi.fn(),
    getQueryData: vi.fn(),
  } as unknown as MockQueryClient
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tryDirectEpisodeRoute', () => {
  it('returns episode route when episode has canonical guid', () => {
    const episode = createMockEpisode({
      guid: MOCK_GUID,
    })

    const result = tryDirectEpisodeRoute(episode, 'us', '123456789')

    expect(result).not.toBeNull()
    expect(result?.type).toBe('episode')
    if (result?.type === 'episode') {
      expect(result.route.params.episodeKey).toBeTruthy()
    }
  })

  it('returns null when episode has no guid', () => {
    const episode = createMockEpisode({
      guid: undefined,
    }) as unknown as Episode

    const result = tryDirectEpisodeRoute(episode, 'us', '123456789')

    expect(result).toBeNull()
  })

  it('returns null when country is invalid', () => {
    const episode = createMockEpisode({
      guid: MOCK_GUID,
    })

    const result = tryDirectEpisodeRoute(episode, 'invalid-country', '123456789')

    expect(result).toBeNull()
  })

  it('returns null when podcastItunesId is empty', () => {
    const episode = createMockEpisode({
      guid: MOCK_GUID,
    })

    const result = tryDirectEpisodeRoute(episode, 'us', '')

    expect(result).toBeNull()
  })
})

describe('resolveEpisodeByTitle - unique match', () => {
  it('resolves to episode route when exactly one title matches', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([
      createMockEpisode({ title: 'Episode 1: The Beginning' }),
      createMockEpisode({ title: 'Episode 2: The Middle' }),
      createMockEpisode({ title: 'Episode 3: The End' }),
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode 2: The Middle',
    })

    expect(result.type).toBe('episode')
    if (result.type === 'episode') {
      expect(result.route.params.id).toBe('123456789')
      expect(result.route.params.country).toBe('us')
    }
    expect(queryClient.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['podcast', 'detail', '123456789', 'country-us'],
      })
    )
  })

  it('resolves to show route when no titles match', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([
      createMockEpisode({ title: 'Episode 1: The Beginning' }),
      createMockEpisode({ title: 'Episode 2: The Middle' }),
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Non-existent Episode',
    })

    expect(result.type).toBe('show')
  })

  it('resolves to show route when multiple titles match (ambiguous)', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([
      createMockEpisode({ title: 'Episode: The Beginning' }),
      createMockEpisode({ title: 'Episode: The Beginning' }), // Duplicate
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode: The Beginning',
    })

    expect(result.type).toBe('show')
  })
})

describe('resolveEpisodeByTitle - date cutoff', () => {
  it('stops scanning when PI episode list items become older than 30 days', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    const now = new Date()
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)

    const mockEpisodes = createMockPodcastEpisodes([
      createMockEpisode({
        title: 'Match',
        pubDate: unixSeconds(now),
      }),
      createMockEpisode({
        title: 'Match', // Duplicate within cutoff (but the first one matches first)
        pubDate: unixSeconds(new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000)),
      }),
      createMockEpisode({
        title: 'Match', // Third duplicate - should trigger ambiguity
        pubDate: unixSeconds(thirtyOneDaysAgo),
      }),
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Match',
    })

    // With 3 matches, the third one triggers ambiguity before date cutoff
    expect(result.type).toBe('show')
  })

  it('continues scanning when pubDate cannot be parsed', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([
      createMockEpisode({
        title: 'Match',
        pubDate: 0,
      }),
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Match',
    })

    expect(result.type).toBe('episode')
  })
})

describe('resolveEpisodeByTitle - 60 episode cap', () => {
  it('scans paginated PI episode pages with a 20 item page size up to 60 total episodes', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    const firstPage = createMockPodcastEpisodePage(
      Array.from({ length: 20 }, (_, i) =>
        createMockEpisode({
          title: `Non-match-${i}`,
          pubDate: unixSeconds(new Date()),
        })
      ),
      { offset: 0, nextOffset: 20, hasMore: true, storedTotal: 61 }
    )
    const secondPage = createMockPodcastEpisodePage(
      Array.from({ length: 20 }, (_, i) =>
        createMockEpisode({
          title: `Non-match-2-${i}`,
          pubDate: unixSeconds(new Date()),
        })
      ),
      { offset: 20, nextOffset: 40, hasMore: true, storedTotal: 61 }
    )
    const thirdPage = createMockPodcastEpisodePage(
      Array.from({ length: 20 }, (_, i) =>
        createMockEpisode({
          title: i === 19 ? 'Match' : `Non-match-3-${i}`,
          pubDate: unixSeconds(new Date()),
        })
      ),
      { offset: 40, nextOffset: 60, hasMore: true, storedTotal: 61 }
    )
    createMockPodcastEpisodePages([firstPage, secondPage, thirdPage])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Match',
    })

    expect(result.type).toBe('episode')
    expect(discovery.fetchPodcastEpisodes).toHaveBeenCalledTimes(3)
    expect(discovery.fetchPodcastEpisodes).toHaveBeenNthCalledWith(
      1,
      '123456789',
      expect.objectContaining({ limit: 20, offset: 0 })
    )
    expect(discovery.fetchPodcastEpisodes).toHaveBeenNthCalledWith(
      2,
      '123456789',
      expect.objectContaining({ limit: 20, offset: 20 })
    )
    expect(discovery.fetchPodcastEpisodes).toHaveBeenNthCalledWith(
      3,
      '123456789',
      expect.objectContaining({ limit: 20, offset: 40 })
    )
  })

  it('stops paginated title scanning when the response has no next page', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    createMockPodcastEpisodePages([
      createMockPodcastEpisodePage([createMockEpisode({ title: 'Non-match' })], {
        offset: 0,
        nextOffset: 1,
        hasMore: false,
      }),
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Match',
    })

    expect(result.type).toBe('show')
    expect(discovery.fetchPodcastEpisodes).toHaveBeenCalledTimes(1)
  })

  it('returns immediately when the PI episode list starts with a unique match', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([
      createMockEpisode({ title: 'Match', pubDate: unixSeconds(new Date()) }),
      createMockEpisode({ title: 'Different', pubDate: unixSeconds(new Date()) }),
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Match',
    })

    expect(result.type).toBe('episode')
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(1)
  })

  it('stops after scanning 60 episodes and returns the unique match', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    const firstTwentyEpisodes = Array.from({ length: 20 }, (_, i) =>
      createMockEpisode({
        title: `Non-match-${i}`,
        pubDate: unixSeconds(new Date()),
      })
    )
    const secondTwentyEpisodes = Array.from({ length: 20 }, (_, i) =>
      createMockEpisode({
        title: `Non-match-2-${i}`,
        pubDate: unixSeconds(new Date()),
      })
    )
    const thirdTwentyEpisodes = Array.from({ length: 20 }, (_, i) =>
      createMockEpisode({
        title: i === 19 ? 'Match' : `Non-match-3-${i}`,
        pubDate: unixSeconds(new Date()),
      })
    )
    const mockEpisodes = createMockPodcastEpisodes([
      ...firstTwentyEpisodes,
      ...secondTwentyEpisodes,
      ...thirdTwentyEpisodes,
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Match',
    })

    expect(result.type).toBe('episode')
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(1)
  })

  it('falls back to show after scanning 60 episodes without a match', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    const firstTwentyEpisodes = Array.from({ length: 20 }, (_, i) =>
      createMockEpisode({
        title: `Non-match-${i}`,
        pubDate: unixSeconds(new Date()),
      })
    )
    const secondTwentyEpisodes = Array.from({ length: 20 }, (_, i) =>
      createMockEpisode({
        title: `Non-match-2-${i}`,
        pubDate: unixSeconds(new Date()),
      })
    )
    const thirdTwentyEpisodes = Array.from({ length: 20 }, (_, i) =>
      createMockEpisode({
        title: `Non-match-3-${i}`,
        pubDate: unixSeconds(new Date()),
      })
    )
    const mockEpisodes = createMockPodcastEpisodes([
      ...firstTwentyEpisodes,
      ...secondTwentyEpisodes,
      ...thirdTwentyEpisodes,
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Match',
    })

    expect(result.type).toBe('show')
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(1)
  })

  it('falls back to show when duplicate title appears in the scanned PI episode list', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([
      createMockEpisode({ title: 'Match', pubDate: unixSeconds(new Date()) }),
      createMockEpisode({ title: 'Match', pubDate: unixSeconds(new Date()) }),
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Match',
    })

    expect(result.type).toBe('show')
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(1)
  })
})

describe('resolveEpisodeByTitle - error handling', () => {
  it('falls back to show route when podcast detail lookup fails', async () => {
    const queryClient = createMockQueryClient()

    vi.mocked(queryClient.fetchQuery).mockRejectedValue(new Error('Network error'))

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode Title',
    })

    expect(result.type).toBe('show')
  })

  it('falls back to show route when PI episode list fetch fails', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        throw new Error('Archive error')
      }
    )
    vi.spyOn(discovery, 'fetchPodcastEpisodes').mockRejectedValue(new Error('Archive error'))

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode Title',
    })

    expect(result.type).toBe('show')
  })

  it('does not require podcast feedUrl to resolve against the PI episode list', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([createMockEpisode({ title: 'Episode Title' })])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode Title',
    })

    expect(result.type).toBe('episode')
  })

  it('falls back to show route when title is null or empty', async () => {
    const queryClient = createMockQueryClient()

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: null,
    })

    expect(result.type).toBe('show')
  })

  it('falls back to show route when country is invalid', async () => {
    const queryClient = createMockQueryClient()

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'invalid-country',
      podcastItunesId: '123456789',
      targetTitle: 'Episode Title',
    })

    expect(result.type).toBe('show')
    expect(result.route).toBeNull()
  })
})

describe('resolveEpisodeByTitle - title normalization', () => {
  it('matches normalized-equivalent titles', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([
      createMockEpisode({ title: 'Episode: "The Beginning"' }),
    ])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    // Use curly quotes in search
    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode: \u201cThe Beginning\u201d', // Curly quotes
    })

    expect(result.type).toBe('episode')
  })

  it('matches case-insensitive titles', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([createMockEpisode({ title: 'THE DAILY' })])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'the daily',
    })

    expect(result.type).toBe('episode')
  })
})

describe('contract/hygiene', () => {
  it('does not introduce route query hints', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([createMockEpisode({ title: 'Episode' })])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode',
    })

    expect(result.type).toBe('episode')

    // Check no search params
    expect(result.route).not.toHaveProperty('search')
  })

  it('returns route objects compatible with react-router navigate', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockEpisodes = createMockPodcastEpisodes([createMockEpisode({ title: 'Episode' })])

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'episodes') {
          return mockEpisodes
        }
        throw new Error('Unexpected query')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode',
    })

    // Verify route structure
    expect(result.route).not.toBeNull()
    if (!result.route) return
    expect(result.route.to).toMatch(/^\/podcast\/\$country\/\$id/)
    expect(result.route.params.country).toBe('us')
    expect(result.route.params.id).toBe('123456789')
  })
})

describe('trySearchEpisodeDirectRoute', () => {
  it('returns episode route when all required fields are valid', () => {
    const result = trySearchEpisodeDirectRoute('123456789', MOCK_GUID, 'us')

    expect(result).not.toBeNull()
    expect(result?.type).toBe('episode')
    if (result?.type === 'episode') {
      expect(result.route.params.country).toBe('us')
      expect(result.route.params.id).toBe('123456789')
      expect(result.route.params.episodeKey).toBeTruthy()
    }
  })

  it('returns null when country is invalid', () => {
    const result = trySearchEpisodeDirectRoute('123456789', MOCK_GUID, 'invalid-country')

    expect(result).toBeNull()
  })

  it('returns null for empty strings', () => {
    expect(trySearchEpisodeDirectRoute('', MOCK_GUID, 'us')).toBeNull()
    expect(trySearchEpisodeDirectRoute('123456789', '', 'us')).toBeNull()
    expect(trySearchEpisodeDirectRoute('123456789', MOCK_GUID, '')).toBeNull()
  })

  it('does not trigger any queries - is purely synchronous', () => {
    const queryClient = createMockQueryClient()
    const fetchSpy = vi.spyOn(queryClient, 'fetchQuery')

    const result = trySearchEpisodeDirectRoute('123456789', MOCK_GUID, 'us')

    expect(result).not.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not add route query hints', () => {
    const result = trySearchEpisodeDirectRoute('123456789', MOCK_GUID, 'us')

    expect(result).not.toBeNull()
    if (result?.type === 'episode') {
      expect(result.route).not.toHaveProperty('search')
    }
  })
})

describe('buildSearchEpisodeRoute', () => {
  it('returns null when canonical podcast identity is missing', () => {
    expect(buildSearchEpisodeRoute('', MOCK_GUID, 'us')).toBeNull()
  })

  it('falls back to show route when canonical episode identity is missing', () => {
    const result = buildSearchEpisodeRoute('123456789', '', 'us')

    expect(result).not.toBeNull()
    expect(result?.params.id).toBe('123456789')
    expect(result?.params.country).toBe('us')
  })
})

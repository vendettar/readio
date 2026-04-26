import type { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { FeedEpisode, Podcast } from '@/lib/discovery'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import {
  resolveEpisodeByTitle,
  tryDirectEpisodeRoute,
  trySearchEpisodeDirectRoute,
} from '../episodeResolver'

const MOCK_GUID = '766f112e-abcd-1234-5678-07e05e548074'
type MockQueryClient = QueryClient & {
  fetchQuery: ReturnType<typeof vi.fn>
  getQueryData: ReturnType<typeof vi.fn>
}

function createMockPodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    title: 'Test Podcast',
    author: 'Test Author',
    artwork: 'https://example.com/artwork.jpg',
    description: 'A test podcast',
    feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
    lastUpdateTime: 1700000000,
    podcastItunesId: '123456789',
    episodeCount: 100,
    language: 'en',
    genres: ['Technology'],
    ...overrides,
  }
}

function createMockFeedEpisode(overrides: Partial<FeedEpisode> = {}): FeedEpisode {
  return {
    title: 'Episode 1: The Beginning',
    description: 'Description',
    audioUrl: 'https://example.com/ep1.mp3',
    pubDate: new Date().toISOString(),
    episodeGuid: MOCK_GUID,
    ...overrides,
  }
}

function createMockQueryClient(): MockQueryClient {
  return {
    fetchQuery: vi.fn(),
    getQueryData: vi.fn(),
  } as unknown as MockQueryClient
}

describe('tryDirectEpisodeRoute', () => {
  it('returns episode route when episode has episodeGuid', () => {
    const episode = createMockFeedEpisode({
      episodeGuid: MOCK_GUID,
    })

    const result = tryDirectEpisodeRoute(episode, 'us', '123456789')

    expect(result).not.toBeNull()
    expect(result?.type).toBe('episode')
    if (result?.type === 'episode') {
      expect(result.route.params.episodeKey).toBeTruthy()
    }
  })

  it('returns null when episode has no episodeGuid', () => {
    const episode = createMockFeedEpisode({
      episodeGuid: undefined,
    })

    const result = tryDirectEpisodeRoute(episode, 'us', '123456789')

    expect(result).toBeNull()
  })

  it('returns null when country is invalid', () => {
    const episode = createMockFeedEpisode({
      episodeGuid: MOCK_GUID,
    })

    const result = tryDirectEpisodeRoute(episode, null, '123456789')

    expect(result).toBeNull()
  })

  it('returns null when podcastItunesId is empty', () => {
    const episode = createMockFeedEpisode({
      episodeGuid: MOCK_GUID,
    })

    const result = tryDirectEpisodeRoute(episode, 'us', '')

    expect(result).toBeNull()
  })
})

describe('resolveEpisodeByTitle - unique match', () => {
  it('resolves to episode route when exactly one title matches', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [
        createMockFeedEpisode({ title: 'Episode 1: The Beginning' }),
        createMockFeedEpisode({ title: 'Episode 2: The Middle' }),
        createMockFeedEpisode({ title: 'Episode 3: The End' }),
      ],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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
  })

  it('resolves to show route when no titles match', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [
        createMockFeedEpisode({ title: 'Episode 1: The Beginning' }),
        createMockFeedEpisode({ title: 'Episode 2: The Middle' }),
      ],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [
        createMockFeedEpisode({ title: 'Episode: The Beginning' }),
        createMockFeedEpisode({ title: 'Episode: The Beginning' }), // Duplicate
      ],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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
  it('stops scanning when feed items become older than 30 days', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    const now = new Date()
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)

    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [
        createMockFeedEpisode({
          title: 'Match',
          pubDate: now.toISOString(),
        }),
        createMockFeedEpisode({
          title: 'Match', // Duplicate within cutoff (but the first one matches first)
          pubDate: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        createMockFeedEpisode({
          title: 'Match', // Third duplicate - should trigger ambiguity
          pubDate: thirtyOneDaysAgo.toISOString(),
        }),
      ],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [
        createMockFeedEpisode({
          title: 'Match',
          pubDate: 'invalid-date',
        }),
      ],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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
  it('returns immediately when first page contains a unique match even if later pages exist', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          const offset = options.queryKey[5] as number
          if (offset === 0) {
            return {
              title: 'Test',
              description: 'D',
              episodes: [
                createMockFeedEpisode({ title: 'Match', pubDate: new Date().toISOString() }),
                createMockFeedEpisode({ title: 'Different', pubDate: new Date().toISOString() }),
              ],
              pageInfo: { hasMore: true },
            }
          }
          throw new Error(`Unexpected second page fetch at offset ${offset}`)
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
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(2)
  })

  it('stops after scanning 60 episodes and returns the unique match', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    const page1Episodes = Array.from({ length: 20 }, (_, i) =>
      createMockFeedEpisode({
        title: `Non-match-${i}`,
        pubDate: new Date().toISOString(),
      })
    )
    const page2Episodes = Array.from({ length: 20 }, (_, i) =>
      createMockFeedEpisode({
        title: `Non-match-2-${i}`,
        pubDate: new Date().toISOString(),
      })
    )
    const page3Episodes = Array.from({ length: 20 }, (_, i) =>
      createMockFeedEpisode({
        title: i === 19 ? 'Match' : `Non-match-3-${i}`,
        pubDate: new Date().toISOString(),
      })
    )

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          const offset = options.queryKey[5] as number
          if (offset === 0) {
            return {
              title: 'Test',
              description: 'D',
              episodes: page1Episodes,
              pageInfo: { hasMore: true },
            }
          }
          if (offset === 20) {
            return {
              title: 'Test',
              description: 'D',
              episodes: page2Episodes,
              pageInfo: { hasMore: true },
            }
          }
          if (offset === 40) {
            return {
              title: 'Test',
              description: 'D',
              episodes: page3Episodes,
              pageInfo: { hasMore: false },
            }
          }
          return { title: 'Test', description: 'D', episodes: [], pageInfo: { hasMore: false } }
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
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(4)
  })

  it('falls back to show after scanning 60 episodes without a match', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    const page1Episodes = Array.from({ length: 20 }, (_, i) =>
      createMockFeedEpisode({
        title: `Non-match-${i}`,
        pubDate: new Date().toISOString(),
      })
    )
    const page2Episodes = Array.from({ length: 20 }, (_, i) =>
      createMockFeedEpisode({
        title: `Non-match-2-${i}`,
        pubDate: new Date().toISOString(),
      })
    )
    const page3Episodes = Array.from({ length: 20 }, (_, i) =>
      createMockFeedEpisode({
        title: `Non-match-3-${i}`,
        pubDate: new Date().toISOString(),
      })
    )

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          const offset = options.queryKey[5] as number
          if (offset === 0) {
            return {
              title: 'Test',
              description: 'D',
              episodes: page1Episodes,
              pageInfo: { hasMore: true },
            }
          }
          if (offset === 20) {
            return {
              title: 'Test',
              description: 'D',
              episodes: page2Episodes,
              pageInfo: { hasMore: true },
            }
          }
          if (offset === 40) {
            return {
              title: 'Test',
              description: 'D',
              episodes: page3Episodes,
              pageInfo: { hasMore: true },
            }
          }
          throw new Error(`Unexpected page fetch at offset ${offset}`)
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
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(4)
  })

  it('falls back to show when duplicate title appears on the same scanned page', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          const offset = options.queryKey[5] as number
          if (offset === 0) {
            return {
              title: 'Test',
              description: 'D',
              episodes: [
                createMockFeedEpisode({ title: 'Match', pubDate: new Date().toISOString() }),
                createMockFeedEpisode({ title: 'Match', pubDate: new Date().toISOString() }),
              ],
              pageInfo: { hasMore: false },
            }
          }
          return { title: 'Test', description: 'D', episodes: [], pageInfo: { hasMore: false } }
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
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(2)
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

  it('falls back to show route when feed fetch fails', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast()

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        throw new Error('Feed error')
      }
    )

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode Title',
    })

    expect(result.type).toBe('show')
  })

  it('falls back to show route when podcast has no feedUrl', async () => {
    const queryClient = createMockQueryClient()
    const mockPodcast = createMockPodcast({ feedUrl: undefined })

    vi.mocked(queryClient.fetchQuery).mockResolvedValue(mockPodcast)

    const result = await resolveEpisodeByTitle({
      queryClient,
      country: 'us',
      podcastItunesId: '123456789',
      targetTitle: 'Episode Title',
    })

    expect(result.type).toBe('show')
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
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [createMockFeedEpisode({ title: 'Episode: "The Beginning"' })],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [createMockFeedEpisode({ title: 'THE DAILY' })],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [createMockFeedEpisode({ title: 'Episode' })],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Description',
      episodes: [createMockFeedEpisode({ title: 'Episode' })],
      pageInfo: { hasMore: false },
    }

    vi.mocked(queryClient.fetchQuery).mockImplementation(
      async (options: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'podcast-detail') {
          return mockPodcast
        }
        if (options.queryKey[0] === 'podcast' && options.queryKey[1] === 'feed') {
          return mockFeed
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

  it('returns null when podcastItunesId is missing', () => {
    const result = trySearchEpisodeDirectRoute(null, MOCK_GUID, 'us')

    expect(result).toBeNull()
  })

  it('returns null when episodeGuid is missing', () => {
    const result = trySearchEpisodeDirectRoute('123456789', null, 'us')

    expect(result).toBeNull()
  })

  it('returns null when country is invalid', () => {
    const result = trySearchEpisodeDirectRoute('123456789', MOCK_GUID, null)

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

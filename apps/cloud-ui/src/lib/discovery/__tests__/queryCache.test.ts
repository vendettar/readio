import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPodcastEpisodesCacheEntries } from '@/lib/discovery/episodeCache'
import { createTestQueryClient } from '../../../__tests__/queryClient'
import discovery from '../index'
import { ensurePodcastDetail, ensurePodcastEpisodes } from '../queryCache'
import { makeEpisode, makePodcastEpisodes } from './fixtures'

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>()
  return {
    ...actual,
    default: {
      ...actual.default,
      getPodcastIndexPodcastByItunesId: vi.fn(),
      fetchPodcastEpisodes: vi.fn(),
    },
  }
})

describe('discovery query cache helpers', () => {
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    queryClient = createTestQueryClient()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('reuses cached podcast detail across imperative callers', async () => {
    vi.mocked(discovery.getPodcastIndexPodcastByItunesId).mockResolvedValue({
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

    const first = await ensurePodcastDetail(queryClient, '123')
    const second = await ensurePodcastDetail(queryClient, '123')

    expect(first).toEqual(second)
    expect(discovery.getPodcastIndexPodcastByItunesId).toHaveBeenCalledTimes(1)
    expect(discovery.getPodcastIndexPodcastByItunesId).toHaveBeenCalledWith(
      '123',
      expect.any(AbortSignal)
    )
  })

  it('reuses cached podcast episodes across imperative callers', async () => {
    vi.mocked(discovery.fetchPodcastEpisodes).mockResolvedValue(
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'ep-1' })],
      })
    )

    const first = await ensurePodcastEpisodes(queryClient, '123')
    const second = await ensurePodcastEpisodes(queryClient, '123')

    expect(first).toEqual(second)
    expect(discovery.fetchPodcastEpisodes).toHaveBeenCalledTimes(1)
    expect(discovery.fetchPodcastEpisodes).toHaveBeenCalledWith('123', expect.any(AbortSignal))
  })

  it('writes podcast episode payloads into the single PI episode-list cache family', async () => {
    vi.mocked(discovery.fetchPodcastEpisodes).mockResolvedValue(
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'ep-1' })],
      })
    )

    await ensurePodcastEpisodes(queryClient, '123')

    expect(getPodcastEpisodesCacheEntries(queryClient, '123')).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          episodes: [expect.objectContaining({ guid: 'ep-1' })],
        }),
      }),
    ])
  })

  it('refetches the fixed PI episode list when podcast detail authority markers drift', async () => {
    vi.mocked(discovery.fetchPodcastEpisodes)
      .mockResolvedValueOnce(
        makePodcastEpisodes({
          episodes: [makeEpisode({ guid: 'ep-1', title: 'Older' })],
        })
      )
      .mockResolvedValueOnce(
        makePodcastEpisodes({
          episodes: [makeEpisode({ guid: 'ep-2', title: 'Newer' })],
        })
      )

    await ensurePodcastEpisodes(queryClient, '123', {
      authority: { lastUpdateTime: 1, episodeCount: 10 },
    })

    const second = await ensurePodcastEpisodes(queryClient, '123', {
      authority: { lastUpdateTime: 2, episodeCount: 10 },
    })

    expect(discovery.fetchPodcastEpisodes).toHaveBeenCalledTimes(2)
    expect(second.episodes[0]?.title).toBe('Newer')
    expect(getPodcastEpisodesCacheEntries(queryClient, '123')).toHaveLength(1)
  })
})

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writePodcastEpisodesToCache } from '@/lib/discovery/episodeCache'
import { createQueryClientHarness } from '../../__tests__/queryClient'
import type { Podcast, PodcastEpisodes } from '../../lib/discovery'
import { makeEpisode, makePodcastEpisodes } from '../../lib/discovery/__tests__/fixtures'
import { buildPodcastDetailQueryKey } from '../../lib/discovery/podcastQueryContract'
import { episodeIdentityToCompactKey } from '../../lib/routes/compactKey'
import { resolveEpisodeResolutionError, useEpisodeResolution } from '../useEpisodeResolution'

const getPodcastIndexPodcastByItunesIdMock = vi.fn()
const fetchPodcastEpisodesMock = vi.fn()

vi.mock('@/lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: (...args: unknown[]) =>
      getPodcastIndexPodcastByItunesIdMock(...args),
    fetchPodcastEpisodes: (...args: unknown[]) => fetchPodcastEpisodesMock(...args),
  },
}))

type WrapperOptions = {
  podcast?: Podcast
  episodeList?: PodcastEpisodes
}

type DeferredPodcast = {
  signal?: AbortSignal
  resolve: (value: Podcast) => void
  reject: (error: unknown) => void
}

function makePodcast(
  overrides: Partial<Podcast> & Pick<Podcast, 'podcastItunesId' | 'title' | 'author'>
): Podcast {
  return {
    artwork: 'https://example.com/show-600.jpg',
    description: 'A podcast',
    lastUpdateTime: 1613394044,
    episodeCount: 50,
    language: 'en',
    genres: ['Technology'],
    ...overrides,
  }
}

function createWrapper(options: WrapperOptions = {}) {
  return createQueryClientHarness({
    setup: (queryClient) => {
      if (options.podcast) {
        queryClient.setQueryData(
          buildPodcastDetailQueryKey(options.podcast.podcastItunesId ?? '12345', 'us'),
          options.podcast
        )
      }

      if (options.episodeList) {
        writePodcastEpisodesToCache(
          queryClient,
          options.podcast?.podcastItunesId ?? '12345',
          options.episodeList,
          {
            country: 'us',
            authority: options.podcast
              ? {
                  lastUpdateTime: options.podcast.lastUpdateTime,
                  episodeCount: options.podcast.episodeCount,
                }
              : undefined,
          }
        )
      }
    },
  })
}

describe('useEpisodeResolution PI episode list semantics', () => {
  beforeEach(() => {
    getPodcastIndexPodcastByItunesIdMock.mockReset()
    fetchPodcastEpisodesMock.mockReset()
    fetchPodcastEpisodesMock.mockResolvedValue(makePodcastEpisodes({ episodes: [] }))
    vi.useRealTimers()
  })

  it('returns PI episode list errors when no higher-priority lookup error exists', () => {
    const resolutionError = resolveEpisodeResolutionError({
      podcastError: null,
      episodesError: new Error('episodes failed'),
    })

    expect(resolutionError?.message).toBe('episodes failed')
  })

  it('starts a new country-scoped podcast detail query across country changes', async () => {
    const deferredCalls: DeferredPodcast[] = []

    getPodcastIndexPodcastByItunesIdMock.mockImplementation((_id: string, signal?: AbortSignal) => {
      return new Promise((resolve, reject) => {
        deferredCalls.push({
          signal,
          resolve: resolve as DeferredPodcast['resolve'],
          reject,
        })
        signal?.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          { once: true }
        )
      })
    })

    const targetKey = episodeIdentityToCompactKey('episode-guid-1')
    if (!targetKey) {
      throw new Error('expected compact key')
    }

    const { result, rerender } = renderHook(
      ({ country }) => useEpisodeResolution('12345', targetKey, country),
      {
        initialProps: { country: 'us' },
        wrapper: createWrapper().wrapper,
      }
    )

    await waitFor(() => expect(deferredCalls).toHaveLength(1))

    rerender({ country: 'jp' })

    await waitFor(() => expect(deferredCalls).toHaveLength(2))

    expect(deferredCalls[0]?.signal?.aborted).toBe(true)

    deferredCalls[1]?.resolve(
      makePodcast({
        podcastItunesId: '12345',
        title: 'JP Podcast',
        author: 'Host',
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resolvedContent).toBeNull()
    expect(result.current.notFound).toBe('episode')
  })

  it('uses cached PI episode list for warm navigation without extra network fetches', async () => {
    const podcast = makePodcast({
      podcastItunesId: '12345',
      title: 'Warm Podcast',
      author: 'Host',
    })
    const episodeList = makePodcastEpisodes({
      episodes: [
        makeEpisode({
          guid: '766f112e-abcd-1234-5678-07e05e548074',
          title: 'Warm Episode',
        }),
      ],
    })

    const targetKey = episodeIdentityToCompactKey('766f112e-abcd-1234-5678-07e05e548074')
    if (!targetKey) {
      throw new Error('expected compact key')
    }

    const { result } = renderHook(() => useEpisodeResolution('12345', targetKey, 'us'), {
      wrapper: createWrapper({ podcast, episodeList }).wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getPodcastIndexPodcastByItunesIdMock).not.toHaveBeenCalled()
    expect(fetchPodcastEpisodesMock).not.toHaveBeenCalled()
    expect(result.current.resolvedContent?.episode.title).toBe('Warm Episode')
    expect(result.current.notFound).toBeNull()
  })

  it('resolves cold opens from PI episode list when no cached episode exists', async () => {
    getPodcastIndexPodcastByItunesIdMock.mockResolvedValue(
      makePodcast({
        podcastItunesId: '12345',
        title: 'Cold Podcast',
        author: 'Host',
      })
    )
    fetchPodcastEpisodesMock.mockResolvedValue(
      makePodcastEpisodes({
        episodes: [
          makeEpisode({
            guid: '766f112e-abcd-1234-5678-07e05e548074',
            title: 'PI Episode',
          }),
        ],
      })
    )

    const targetKey = episodeIdentityToCompactKey('766f112e-abcd-1234-5678-07e05e548074')
    if (!targetKey) {
      throw new Error('expected compact key')
    }

    const { result } = renderHook(() => useEpisodeResolution('12345', targetKey, 'us'), {
      wrapper: createWrapper().wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getPodcastIndexPodcastByItunesIdMock).toHaveBeenCalledWith('12345', expect.anything())
    expect(fetchPodcastEpisodesMock).toHaveBeenCalledWith('12345', expect.anything())
    expect(result.current.resolvedContent?.episode.title).toBe('PI Episode')
    expect(result.current.notFound).toBeNull()
  })

  it('returns episodeNotFound semantics when the target guid is absent from the PI episode list', async () => {
    getPodcastIndexPodcastByItunesIdMock.mockResolvedValue(
      makePodcast({
        podcastItunesId: '12345',
        title: 'Cold Podcast',
        author: 'Host',
      })
    )
    fetchPodcastEpisodesMock.mockResolvedValue(
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: 'different-guid' })],
      })
    )

    const missingKey = episodeIdentityToCompactKey('missing-guid')
    if (!missingKey) {
      throw new Error('expected compact key')
    }

    const { result } = renderHook(() => useEpisodeResolution('12345', missingKey, 'us'), {
      wrapper: createWrapper().wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchPodcastEpisodesMock).toHaveBeenCalledTimes(1)
    expect(result.current.resolvedContent).toBeNull()
    expect(result.current.resolutionError).toBeNull()
    expect(result.current.notFound).toBe('episode')
  })

  it('does not let a stale complete episode cache block deep-link refresh for a missing guid', async () => {
    const targetGuid = 'fresh-guid'
    const targetKey = episodeIdentityToCompactKey(targetGuid)
    if (!targetKey) {
      throw new Error('expected compact key')
    }

    const podcast = makePodcast({
      podcastItunesId: '12345',
      title: 'Stale Complete Podcast',
      author: 'Host',
    })

    const staleEpisodeList = makePodcastEpisodes({
      episodes: [makeEpisode({ guid: 'stale-guid', title: 'Old Episode' })],
    })

    const staleUpdatedAt = Date.now() - 2 * 24 * 60 * 60 * 1000
    const { wrapper } = createQueryClientHarness({
      setup: (queryClient) => {
        queryClient.setQueryData(buildPodcastDetailQueryKey('12345', 'us'), podcast)
        writePodcastEpisodesToCache(queryClient, '12345', staleEpisodeList, {
          now: staleUpdatedAt,
        })
      },
    })

    fetchPodcastEpisodesMock.mockResolvedValue(
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: targetGuid, title: 'Fresh Episode' })],
      })
    )

    const { result } = renderHook(() => useEpisodeResolution('12345', targetKey, 'us'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchPodcastEpisodesMock).toHaveBeenCalledTimes(1)
    expect(result.current.resolvedContent?.episode.title).toBe('Fresh Episode')
  })

  it('keeps cold-open detail resolution loading while the target guid only exists in the refetch result', async () => {
    const targetGuid = 'late-guid'
    const targetKey = episodeIdentityToCompactKey(targetGuid)
    if (!targetKey) {
      throw new Error('expected compact key')
    }

    const podcast = makePodcast({
      podcastItunesId: '12345',
      title: 'Deferred Detail Podcast',
      author: 'Host',
    })

    const staleEpisodeList = makePodcastEpisodes({
      episodes: [makeEpisode({ guid: 'stale-guid', title: 'Old Episode' })],
    })

    let resolveFetch: ((value: PodcastEpisodes) => void) | undefined
    fetchPodcastEpisodesMock.mockImplementation(
      () =>
        new Promise<PodcastEpisodes>((resolve) => {
          resolveFetch = resolve
        })
    )

    const staleUpdatedAt = Date.now() - 2 * 24 * 60 * 60 * 1000
    const { wrapper } = createQueryClientHarness({
      setup: (queryClient) => {
        queryClient.setQueryData(buildPodcastDetailQueryKey('12345', 'us'), podcast)
        writePodcastEpisodesToCache(queryClient, '12345', staleEpisodeList, {
          now: staleUpdatedAt,
        })
      },
    })

    const { result } = renderHook(() => useEpisodeResolution('12345', targetKey, 'us'), {
      wrapper,
    })

    await waitFor(() => expect(fetchPodcastEpisodesMock).toHaveBeenCalledTimes(1))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.resolvedContent).toBeNull()
    expect(result.current.resolutionError).toBeNull()

    resolveFetch?.(
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: targetGuid, title: 'Late Episode' })],
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resolvedContent?.episode.title).toBe('Late Episode')
    expect(result.current.resolutionError).toBeNull()
    expect(result.current.notFound).toBeNull()
  })

  it('does not resolve the target episode from authority-mismatched bootstrap data while refetch is in flight', async () => {
    const targetGuid = 'shared-guid'
    const targetKey = episodeIdentityToCompactKey(targetGuid)
    if (!targetKey) {
      throw new Error('expected compact key')
    }

    const podcast = makePodcast({
      podcastItunesId: '12345',
      title: 'Authority Drift Podcast',
      author: 'Host',
      lastUpdateTime: 2,
      episodeCount: 10,
    })

    const staleEpisodeList = makePodcastEpisodes({
      episodes: [makeEpisode({ guid: targetGuid, title: 'Stale Episode' })],
    })

    let resolveFetch: ((value: PodcastEpisodes) => void) | undefined
    fetchPodcastEpisodesMock.mockImplementation(
      () =>
        new Promise<PodcastEpisodes>((resolve) => {
          resolveFetch = resolve
        })
    )

    const { wrapper } = createQueryClientHarness({
      setup: (queryClient) => {
        queryClient.setQueryData(buildPodcastDetailQueryKey('12345', 'us'), podcast)
        writePodcastEpisodesToCache(queryClient, '12345', staleEpisodeList, {
          authority: {
            lastUpdateTime: 1,
            episodeCount: 10,
          },
        })
      },
    })

    const { result } = renderHook(() => useEpisodeResolution('12345', targetKey, 'us'), {
      wrapper,
    })

    await waitFor(() => expect(fetchPodcastEpisodesMock).toHaveBeenCalledTimes(1))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.resolvedContent).toBeNull()
    expect(result.current.resolutionError).toBeNull()
    expect(fetchPodcastEpisodesMock).toHaveBeenCalledTimes(1)

    resolveFetch?.(
      makePodcastEpisodes({
        episodes: [makeEpisode({ guid: targetGuid, title: 'Fresh Episode' })],
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.resolvedContent?.episode.title).toBe('Fresh Episode')
    expect(result.current.notFound).toBeNull()
  })
})

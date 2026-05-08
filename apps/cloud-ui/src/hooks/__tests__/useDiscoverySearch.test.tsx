import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../__tests__/queryClient'
import { makeSearchEpisode, makeSearchPodcast } from '../../lib/discovery/__tests__/fixtures'
import { useDiscoverySearch } from '../useDiscoverySearch'

const searchPodcastsMock = vi.fn()
const searchEpisodesMock = vi.fn()
const networkState = { isOnline: true }

vi.mock('../../lib/discovery', () => ({
  default: {
    searchPodcasts: (...args: unknown[]) => searchPodcastsMock(...args),
    searchEpisodes: (...args: unknown[]) => searchEpisodesMock(...args),
  },
}))

vi.mock('../useNetworkStatus', () => ({
  useNetworkStatus: () => networkState,
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: { country: string }) => unknown) =>
    selector({ country: 'us' }),
}))

vi.mock('../../lib/runtimeConfig', () => ({
  getAppConfig: () => ({
    DEFAULT_COUNTRY: 'us',
  }),
}))

describe('useDiscoverySearch', () => {
  beforeEach(() => {
    networkState.isOnline = true
    searchPodcastsMock.mockReset()
    searchEpisodesMock.mockReset()
    searchPodcastsMock.mockResolvedValue([])
    searchEpisodesMock.mockResolvedValue([])
  })

  it('keeps both sections idle for queries shorter than 2 characters', () => {
    const { result } = renderHook(() => useDiscoverySearch('a', true), {
      wrapper: createQueryClientWrapper(),
    })

    expect(result.current.podcastSection.status).toBe('idle')
    expect(result.current.episodeSection.status).toBe('idle')
    expect(result.current.isLoading).toBe(false)
    expect(searchPodcastsMock).not.toHaveBeenCalled()
    expect(searchEpisodesMock).not.toHaveBeenCalled()
  })

  it('transitions from idle to loading after debounce when a query becomes active', async () => {
    searchPodcastsMock.mockImplementation(() => new Promise(() => {}))
    searchEpisodesMock.mockImplementation(() => new Promise(() => {}))

    const { result, rerender } = renderHook(({ query }) => useDiscoverySearch(query, true), {
      initialProps: { query: 'a' },
      wrapper: createQueryClientWrapper(),
    })

    expect(result.current.podcastSection.status).toBe('idle')
    expect(result.current.episodeSection.status).toBe('idle')
    expect(searchPodcastsMock).not.toHaveBeenCalled()
    expect(searchEpisodesMock).not.toHaveBeenCalled()

    rerender({ query: 'podcast' })

    expect(result.current.podcastSection.status).toBe('idle')
    expect(result.current.episodeSection.status).toBe('idle')

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350))
    })

    await waitFor(() => {
      expect(result.current.podcastSection.status).toBe('loading')
      expect(result.current.episodeSection.status).toBe('loading')
      expect(result.current.isLoading).toBe(true)
      expect(searchPodcastsMock).toHaveBeenCalledWith('podcast', 'us', expect.anything())
      expect(searchEpisodesMock).toHaveBeenCalledWith('podcast', 'us', expect.anything())
    })
  })

  it('returns ready sections with resolved discovery results', async () => {
    searchPodcastsMock.mockResolvedValue([makeSearchPodcast({ title: 'Podcast Result' })])
    searchEpisodesMock.mockResolvedValue([makeSearchEpisode({ title: 'Episode Result' })])

    const { result } = renderHook(() => useDiscoverySearch('podcast', true), {
      wrapper: createQueryClientWrapper(),
    })

    await waitFor(() => {
      expect(result.current.podcastSection.status).toBe('ready')
      expect(result.current.episodeSection.status).toBe('ready')
      expect(result.current.podcastSection.items[0]?.title).toBe('Podcast Result')
      expect(result.current.episodeSection.items[0]?.title).toBe('Episode Result')
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('stays non-loading and skips discovery requests while offline', () => {
    networkState.isOnline = false

    const { result } = renderHook(() => useDiscoverySearch('podcast', true), {
      wrapper: createQueryClientWrapper(),
    })

    expect(result.current.podcastSection.status).toBe('unavailable')
    expect(result.current.episodeSection.status).toBe('unavailable')
    expect(result.current.podcastSection.items).toEqual([])
    expect(result.current.episodeSection.items).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(searchPodcastsMock).not.toHaveBeenCalled()
    expect(searchEpisodesMock).not.toHaveBeenCalled()
  })
})

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../__tests__/queryClient'
import { makeTopEpisode, makeTopPodcast } from '../../lib/discovery/__tests__/fixtures'
import { DiscoveryParseError } from '../../lib/discovery/cloudApi'
import { FetchError, NetworkError } from '../../lib/fetchUtils'
import { useEditorPicks, useTopEpisodes, useTopPodcasts } from '../useDiscoveryPodcasts'

const fetchTopPodcastsMock = vi.fn()
const getEditorPicksMock = vi.fn()
const fetchTopEpisodesMock = vi.fn()
const networkState = { isOnline: true }

vi.mock('../../lib/discovery', () => ({
  default: {
    fetchTopPodcasts: (...args: unknown[]) => fetchTopPodcastsMock(...args),
    getPodcastIndexPodcastsBatchByGuid: (...args: unknown[]) => getEditorPicksMock(...args),
    fetchTopEpisodes: (...args: unknown[]) => fetchTopEpisodesMock(...args),
  },
}))

vi.mock('../useNetworkStatus', () => ({
  useNetworkStatus: () => networkState,
}))

vi.mock('../../constants/app', () => ({
  getEditorPicksForRegion: vi.fn(() => ['feed-guid-1']),
  isPodcastGuid: vi.fn(() => true),
}))

describe('useDiscoveryPodcasts retry ownership', () => {
  const wrapper = createQueryClientWrapper({
    setup: (queryClient) => {
      queryClient.setDefaultOptions({
        queries: {
          retry: false,
          retryDelay: 0,
        },
      })
    },
  })

  beforeEach(() => {
    networkState.isOnline = true
    fetchTopPodcastsMock.mockReset()
    getEditorPicksMock.mockReset()
    fetchTopEpisodesMock.mockReset()
    fetchTopPodcastsMock.mockResolvedValue([])
    getEditorPicksMock.mockResolvedValue([])
    fetchTopEpisodesMock.mockResolvedValue([])
  })

  it('retries top podcasts once when the discovery boundary marks a 5xx fetch error as retryable', async () => {
    fetchTopPodcastsMock
      .mockRejectedValueOnce(
        new FetchError(
          'service unavailable',
          '/api/v1/discovery/top-podcasts?country=us',
          503,
          'direct'
        )
      )
      .mockResolvedValueOnce([makeTopPodcast({ title: 'Recovered Podcast' })])

    const { result } = renderHook(() => useTopPodcasts('us'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
      expect(result.current.data?.[0]?.title).toBe('Recovered Podcast')
    })

    expect(fetchTopPodcastsMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry editor picks when the discovery boundary marks the error as terminal', async () => {
    getEditorPicksMock.mockRejectedValue(
      new DiscoveryParseError('POST /api/v1/discovery/podcasts/batch: invalid JSON response')
    )

    const { result } = renderHook(() => useEditorPicks('us'), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(getEditorPicksMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry top episodes on network errors', async () => {
    fetchTopEpisodesMock.mockRejectedValue(new NetworkError('offline'))

    const { result } = renderHook(() => useTopEpisodes('us'), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(fetchTopEpisodesMock).toHaveBeenCalledTimes(1)
  })

  it('filters invalid zero-itunes-id rows after a successful retryable top episodes fetch', async () => {
    fetchTopEpisodesMock
      .mockRejectedValueOnce(
        new FetchError(
          'service unavailable',
          '/api/v1/discovery/top-episodes?country=us',
          503,
          'direct'
        )
      )
      .mockResolvedValueOnce([
        makeTopEpisode({ title: 'Valid Episode', podcastItunesId: '123' }),
        makeTopEpisode({ title: 'Invalid Episode', podcastItunesId: '0' }),
      ])

    const { result } = renderHook(() => useTopEpisodes('us'), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0]?.title).toBe('Valid Episode')
    })

    expect(fetchTopEpisodesMock).toHaveBeenCalledTimes(2)
  })
})

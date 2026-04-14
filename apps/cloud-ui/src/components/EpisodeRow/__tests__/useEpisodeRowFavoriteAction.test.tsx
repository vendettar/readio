import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEpisodeRowFavoriteAction } from '../useEpisodeRowFavoriteAction'

const logError = vi.fn()

vi.mock('@/lib/logger', () => ({
  logError: (...args: unknown[]) => logError(...args),
}))

vi.mock('@/lib/toast', () => ({
  toast: {
    errorKey: vi.fn(),
  },
}))

import { toast } from '@/lib/toast'

describe('useEpisodeRowFavoriteAction', () => {
  beforeEach(() => {
    logError.mockReset()
    vi.mocked(toast.errorKey).mockReset()
  })

  it('removes favorite when item is already favorited', async () => {
    const addFavorite = vi.fn()
    const removeFavorite = vi.fn().mockResolvedValue(undefined)
    const buildAddPayload = vi.fn()

    const { result } = renderHook(() =>
      useEpisodeRowFavoriteAction({
        favorited: true,
        favoriteKey: 'feed::audio',
        addFavorite,
        removeFavorite,
        buildAddPayload,
        errorLogScope: 'TestRow',
      })
    )

    await act(async () => {
      await result.current.toggleFavorite()
    })

    expect(removeFavorite).toHaveBeenCalledWith('feed::audio')
    expect(addFavorite).not.toHaveBeenCalled()
    expect(buildAddPayload).not.toHaveBeenCalled()
  })

  it('shows feedback when remove favorite fails', async () => {
    const addFavorite = vi.fn()
    const removeFavorite = vi.fn().mockRejectedValue(new Error('remove failed'))
    const buildAddPayload = vi.fn()

    const { result } = renderHook(() =>
      useEpisodeRowFavoriteAction({
        favorited: true,
        favoriteKey: 'feed::audio',
        addFavorite,
        removeFavorite,
        buildAddPayload,
        errorLogScope: 'TestRow',
      })
    )

    await act(async () => {
      await result.current.toggleFavorite()
    })

    expect(removeFavorite).toHaveBeenCalledWith('feed::audio')
    expect(logError).toHaveBeenCalledWith('[TestRow] Failed to remove favorite:', expect.any(Error))
    expect(toast.errorKey).toHaveBeenCalledWith('toastRemoveFavoriteFailed')
  })

  it('shows network-specific toast on remove failure when upstream is unavailable', async () => {
    const addFavorite = vi.fn()
    const removeFavorite = vi.fn().mockRejectedValue(new Error('Network unavailable'))
    const buildAddPayload = vi.fn()

    const { result } = renderHook(() =>
      useEpisodeRowFavoriteAction({
        favorited: true,
        favoriteKey: 'feed::audio',
        addFavorite,
        removeFavorite,
        buildAddPayload,
        errorLogScope: 'TestRow',
      })
    )

    await act(async () => {
      await result.current.toggleFavorite()
    })

    expect(toast.errorKey).toHaveBeenCalledWith('toastFavoriteNetworkUnavailable')
  })

  it('shows source-not-found toast on remove failure when favorite source is missing', async () => {
    const addFavorite = vi.fn()
    const removeFavorite = vi.fn().mockRejectedValue(new Error('Source not found'))
    const buildAddPayload = vi.fn()

    const { result } = renderHook(() =>
      useEpisodeRowFavoriteAction({
        favorited: true,
        favoriteKey: 'feed::audio',
        addFavorite,
        removeFavorite,
        buildAddPayload,
        errorLogScope: 'TestRow',
      })
    )

    await act(async () => {
      await result.current.toggleFavorite()
    })

    expect(toast.errorKey).toHaveBeenCalledWith('toastFavoriteSourceNotFound')
  })

  it('adds favorite and tracks saving state', async () => {
    const addFavorite = vi.fn().mockResolvedValue(undefined)
    const removeFavorite = vi.fn()
    const buildAddPayload = vi.fn().mockResolvedValue({
      podcast: {
        podcastItunesId: '1',
        collectionName: 'Show',
        artistName: 'Host',
        artworkUrl100: '',
        artworkUrl600: '',
        feedUrl: 'feed',
        collectionViewUrl: '',
        genres: [],
      },
      episode: {
        id: 'ep-1',
        title: 'Episode',
        audioUrl: 'audio',
        description: '',
        pubDate: '',
      },
      country: 'us',
    })

    const { result } = renderHook(() =>
      useEpisodeRowFavoriteAction({
        favorited: false,
        favoriteKey: null,
        addFavorite,
        removeFavorite,
        buildAddPayload,
        errorLogScope: 'TestRow',
      })
    )

    act(() => {
      void result.current.toggleFavorite()
    })

    await waitFor(() => expect(result.current.isSaving).toBe(false))
    expect(buildAddPayload).toHaveBeenCalledTimes(1)
    expect(addFavorite).toHaveBeenCalledTimes(1)
    expect(removeFavorite).not.toHaveBeenCalled()
  })

  it('keeps search fallback/error path visible on add failure', async () => {
    const addFavorite = vi.fn().mockRejectedValue(new Error('add failed'))
    const removeFavorite = vi.fn()
    const buildAddPayload = vi.fn().mockResolvedValue({
      podcast: {
        podcastItunesId: '1',
        collectionName: 'Show',
        artistName: 'Host',
        artworkUrl100: '',
        artworkUrl600: '',
        feedUrl: 'feed',
        collectionViewUrl: '',
        genres: [],
      },
      episode: {
        id: 'ep-1',
        title: 'Episode',
        audioUrl: 'audio',
        description: '',
        pubDate: '',
      },
    })

    const { result } = renderHook(() =>
      useEpisodeRowFavoriteAction({
        favorited: false,
        favoriteKey: null,
        addFavorite,
        removeFavorite,
        buildAddPayload,
        errorLogScope: 'SearchEpisodeItem',
      })
    )

    await act(async () => {
      await result.current.toggleFavorite()
    })

    expect(logError).toHaveBeenCalledWith(
      '[SearchEpisodeItem] Failed to favorite:',
      expect.any(Error)
    )
    expect(toast.errorKey).toHaveBeenCalledWith('toastAddFavoriteFailed')
    expect(result.current.isSaving).toBe(false)
  })

  it('shows network-specific toast on add failure when upstream is unavailable', async () => {
    const addFavorite = vi.fn().mockRejectedValue(new Error('Network unavailable'))
    const removeFavorite = vi.fn()
    const buildAddPayload = vi.fn().mockResolvedValue({
      podcast: {
        podcastItunesId: '1',
        collectionName: 'Show',
        artistName: 'Host',
        artworkUrl100: '',
        artworkUrl600: '',
        feedUrl: 'feed',
        collectionViewUrl: '',
        genres: [],
      },
      episode: {
        id: 'ep-1',
        title: 'Episode',
        audioUrl: 'audio',
        description: '',
        pubDate: '',
      },
    })

    const { result } = renderHook(() =>
      useEpisodeRowFavoriteAction({
        favorited: false,
        favoriteKey: null,
        addFavorite,
        removeFavorite,
        buildAddPayload,
        errorLogScope: 'SearchEpisodeItem',
      })
    )

    await act(async () => {
      await result.current.toggleFavorite()
    })

    expect(toast.errorKey).toHaveBeenCalledWith('toastFavoriteNetworkUnavailable')
  })

  it('shows source-not-found toast on add failure when podcast source is missing', async () => {
    const addFavorite = vi.fn().mockRejectedValue(new Error('Podcast not found'))
    const removeFavorite = vi.fn()
    const buildAddPayload = vi.fn().mockResolvedValue({
      podcast: {
        podcastItunesId: '1',
        collectionName: 'Show',
        artistName: 'Host',
        artworkUrl100: '',
        artworkUrl600: '',
        feedUrl: 'feed',
        collectionViewUrl: '',
        genres: [],
      },
      episode: {
        id: 'ep-1',
        title: 'Episode',
        audioUrl: 'audio',
        description: '',
        pubDate: '',
      },
    })

    const { result } = renderHook(() =>
      useEpisodeRowFavoriteAction({
        favorited: false,
        favoriteKey: null,
        addFavorite,
        removeFavorite,
        buildAddPayload,
        errorLogScope: 'SearchEpisodeItem',
      })
    )

    await act(async () => {
      await result.current.toggleFavorite()
    })

    expect(toast.errorKey).toHaveBeenCalledWith('toastFavoriteSourceNotFound')
  })
})

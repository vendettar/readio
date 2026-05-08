import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchSection } from '../searchSection'
import { useGlobalSearch } from '../useGlobalSearch'

const useDiscoverySearchMock = vi.fn()
const useLocalSearchMock = vi.fn()

vi.mock('../useDiscoverySearch', () => ({
  useDiscoverySearch: (...args: unknown[]) => useDiscoverySearchMock(...args),
}))

vi.mock('../useLocalSearch', () => ({
  useLocalSearch: (...args: unknown[]) => useLocalSearchMock(...args),
}))

function makeSection<T>(
  items: T[] = [],
  status: 'idle' | 'loading' | 'ready' | 'unavailable' = 'ready'
): SearchSection<T> {
  return { items, status }
}

describe('useGlobalSearch', () => {
  beforeEach(() => {
    useDiscoverySearchMock.mockReset()
    useLocalSearchMock.mockReset()
    useDiscoverySearchMock.mockReturnValue({
      podcastSection: makeSection([]),
      episodeSection: makeSection([]),
      isLoading: false,
    })
    useLocalSearchMock.mockReturnValue({
      localResults: [],
      isLoading: false,
    })
  })

  it('reports partial success when one section is ready and another is still loading', () => {
    useDiscoverySearchMock.mockReturnValue({
      podcastSection: makeSection([{ podcastItunesId: 'pod-1', title: 'Podcast Result' }]),
      episodeSection: makeSection([], 'loading'),
      isLoading: true,
    })

    const { result } = renderHook(() => useGlobalSearch('podcast', true))

    expect(result.current.podcastSection).toEqual(
      makeSection([{ podcastItunesId: 'pod-1', title: 'Podcast Result' }])
    )
    expect(result.current.episodeSection).toEqual(makeSection([], 'loading'))
    expect(result.current.localSection).toEqual(makeSection([]))
    expect(result.current.overallState).toBe('refreshing')
    expect(result.current.totalResultsCount).toBe(1)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isEmpty).toBe(false)
  })

  it('reports empty only when an active query has no items across all ready sections', () => {
    const { result } = renderHook(() => useGlobalSearch('podcast', true))

    expect(result.current.overallState).toBe('empty')
    expect(result.current.totalResultsCount).toBe(0)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isEmpty).toBe(true)
  })

  it('keeps local section idle for non-active queries even if the local hook has stale results', () => {
    useLocalSearchMock.mockReturnValue({
      localResults: [{ id: 'history-1', title: 'Stale Result' }],
      isLoading: true,
    })

    const { result } = renderHook(() => useGlobalSearch('a', true))

    expect(result.current.localSection).toEqual(makeSection([], 'idle'))
    expect(result.current.overallState).toBe('idle')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isEmpty).toBe(false)
  })

  it('treats local-only ready results as non-empty even when discovery is empty', () => {
    useLocalSearchMock.mockReturnValue({
      localResults: [{ id: 'history-1', title: 'Local Result' }],
      isLoading: false,
    })

    const { result } = renderHook(() => useGlobalSearch('podcast', true))

    expect(result.current.podcastSection).toEqual(makeSection([]))
    expect(result.current.episodeSection).toEqual(makeSection([]))
    expect(result.current.localSection).toEqual(
      makeSection([{ id: 'history-1', title: 'Local Result' }])
    )
    expect(result.current.overallState).toBe('results')
    expect(result.current.totalResultsCount).toBe(1)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isEmpty).toBe(false)
  })

  it('stays loading but non-empty when discovery is idle and local results are still resolving', () => {
    useLocalSearchMock.mockReturnValue({
      localResults: [{ id: 'history-1', title: 'Prior Local Result' }],
      isLoading: true,
    })

    const { result } = renderHook(() => useGlobalSearch('podcast', true))

    expect(result.current.localSection).toEqual(
      makeSection([{ id: 'history-1', title: 'Prior Local Result' }], 'loading')
    )
    expect(result.current.overallState).toBe('refreshing')
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isEmpty).toBe(false)
  })

  it('stays loading but non-empty when discovery is ready and local stale items are still resolving', () => {
    useDiscoverySearchMock.mockReturnValue({
      podcastSection: makeSection([{ podcastItunesId: 'pod-1', title: 'Podcast Result' }]),
      episodeSection: makeSection([]),
      isLoading: false,
    })
    useLocalSearchMock.mockReturnValue({
      localResults: [{ id: 'history-1', title: 'Prior Local Result' }],
      isLoading: true,
    })

    const { result } = renderHook(() => useGlobalSearch('podcast', true))

    expect(result.current.podcastSection).toEqual(
      makeSection([{ podcastItunesId: 'pod-1', title: 'Podcast Result' }])
    )
    expect(result.current.localSection).toEqual(
      makeSection([{ id: 'history-1', title: 'Prior Local Result' }], 'loading')
    )
    expect(result.current.overallState).toBe('refreshing')
    expect(result.current.totalResultsCount).toBe(2)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isEmpty).toBe(false)
  })

  it('reports unavailable when discovery is unavailable and no local results exist', () => {
    useDiscoverySearchMock.mockReturnValue({
      podcastSection: makeSection([], 'unavailable'),
      episodeSection: makeSection([], 'unavailable'),
      isLoading: false,
    })

    const { result } = renderHook(() => useGlobalSearch('podcast', true))

    expect(result.current.overallState).toBe('unavailable')
    expect(result.current.totalResultsCount).toBe(0)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isEmpty).toBe(false)
  })
})

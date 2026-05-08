import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as EpisodeRow from '../../components/EpisodeRow'
import { type GlobalSearchResults, useGlobalSearch } from '../../hooks/useGlobalSearch'
import { makeSearchPodcast } from '../../lib/discovery/__tests__/fixtures'
import type { LocalSearchResult } from '../../hooks/useLocalSearch'
import type { PodcastDownload } from '../../lib/db/types'
import SearchPage from '../SearchPage'

const skeletonSpy = vi.spyOn(EpisodeRow, 'EpisodeListSkeleton')
const makeSection = <T,>(items: T[] = [], status: 'idle' | 'loading' | 'ready' = 'ready') => ({
  items,
  status,
})

function buildGlobalSearchResults(
  overrides: Partial<GlobalSearchResults>
): GlobalSearchResults {
  const podcastSection = overrides.podcastSection ?? makeSection([])
  const episodeSection = overrides.episodeSection ?? makeSection([])
  const localSection = overrides.localSection ?? makeSection([])
  const totalResultsCount =
    overrides.totalResultsCount ??
    podcastSection.items.length + episodeSection.items.length + localSection.items.length
  const overallState =
    overrides.overallState ??
    (overrides.isLoading
      ? totalResultsCount > 0
        ? 'refreshing'
        : 'loading'
      : overrides.isEmpty
        ? 'empty'
        : totalResultsCount > 0
          ? 'results'
          : 'idle')

  return {
    podcastSection,
    episodeSection,
    localSection,
    totalResultsCount,
    overallState,
    isLoading: overrides.isLoading ?? false,
    isEmpty: overrides.isEmpty ?? false,
  }
}

vi.mock('../../hooks/useGlobalSearch')
const mockSearchState = { q: 'apple' }
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === 'searchResultsCount' ? `${key}:${options?.count ?? 0}` : key,
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => mockSearchState,
}))

vi.mock('../../components/layout', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title, meta }: { title: string; meta?: ReactNode }) => (
    <div>
      <div>{title}</div>
      {meta}
    </div>
  ),
}))

vi.mock('../../components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}))

vi.mock('../../components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../components/EpisodeRow/EpisodeRowSkeleton', () => ({
  EpisodeRowSkeleton: () => <div data-testid="episode-row-skeleton-child" />,
}))

vi.mock('../../components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../../components/ui/loading-spinner', () => ({
  LoadingSpinner: () => <div data-testid="spinner" />,
}))

vi.mock('../../components/GlobalSearch/SearchResultItem', () => ({
  SearchResultItem: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../components/PodcastCard/PodcastCard', () => ({
  PodcastCard: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../components/PodcastGrid', () => ({
  PodcastGrid: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({ playSearchEpisode: vi.fn() }),
}))

describe('SearchPage Loading Persistence', () => {
  const priorDownload: PodcastDownload = {
    id: 'download-1',
    name: 'Prior Result',
    sourceType: 'podcast_download',
    audioId: 'audio-1',
    sourceUrlNormalized: 'https://example.com/audio.mp3',
    sizeBytes: 1,
    createdAt: 1,
    downloadedAt: 1,
    countryAtSave: 'US',
    sourcePodcastItunesId: 'podcast-1',
    sourceEpisodeGuid: 'episode-guid-1',
    sourcePodcastTitle: 'Podcast Title',
    sourceEpisodeTitle: 'Prior Result',
    sourceDescription: 'Episode description',
    sourceArtworkUrl: 'https://example.com/cover.jpg',
  }

  const priorLocalResult: LocalSearchResult = {
    id: '1',
    title: 'Prior Result',
    type: 'download',
    subtitle: '',
    badges: ['download'],
    data: priorDownload,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchState.q = 'apple'
  })

  afterEach(() => {
    skeletonSpy.mockClear()
  })

  it('keeps prior results visible while loading refreshed results', () => {
    vi.mocked(useGlobalSearch).mockReturnValue(
      buildGlobalSearchResults({
      podcastSection: makeSection([]),
      episodeSection: makeSection([]),
      localSection: makeSection([priorLocalResult], 'loading'),
      isLoading: true,
      isEmpty: false,
      })
    )

    render(<SearchPage />)

    expect(screen.getByText('Prior Result')).toBeDefined()
    expect(screen.getByTestId('spinner')).toBeDefined()
    expect(screen.getByText('loading')).toBeDefined()
    expect(skeletonSpy).not.toHaveBeenCalled()
  })

  it('shows skeleton and disables nested announcement when loading without results', () => {
    vi.mocked(useGlobalSearch).mockReturnValue(
      buildGlobalSearchResults({
      podcastSection: makeSection([], 'loading'),
      episodeSection: makeSection([], 'loading'),
      localSection: makeSection([], 'loading'),
      isLoading: true,
      isEmpty: true,
      })
    )

    render(<SearchPage />)

    const loadingContainer = screen.getByTestId('initial-loading')
    expect(loadingContainer.getAttribute('aria-busy')).toBe('true')
    expect(loadingContainer.getAttribute('aria-live')).toBe('polite')
    expect(loadingContainer.getAttribute('aria-label')).toBe('loadingSearchResults')

    expect(skeletonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        announce: false,
        label: 'loadingEpisodes',
      }),
      undefined
    )

    const skeletonOutput = screen.getByLabelText('loadingEpisodes')
    expect(loadingContainer.contains(skeletonOutput)).toBe(true)
    expect(skeletonOutput.getAttribute('aria-live')).toBe('off')
    expect(screen.queryByText('Prior Result')).toBeNull()
  })

  it('keeps ready sections visible while another section is still loading', () => {
    vi.mocked(useGlobalSearch).mockReturnValue(
      buildGlobalSearchResults({
      podcastSection: makeSection(
        [
          makeSearchPodcast({
            podcastItunesId: 'pod-1',
            title: 'Podcast Result',
            author: 'Host',
            artwork: 'https://example.com/show.jpg',
          }),
        ],
        'ready'
      ),
      episodeSection: makeSection([], 'loading'),
      localSection: makeSection([]),
      isLoading: true,
      isEmpty: false,
      })
    )

    render(<SearchPage />)

    expect(screen.getByText('Podcast Result')).toBeDefined()
    expect(screen.getByTestId('spinner')).toBeDefined()
    expect(screen.queryByTestId('initial-loading')).toBeNull()
    expect(screen.queryByText('searchNoResults')).toBeNull()
    expect(skeletonSpy).not.toHaveBeenCalled()
  })

  it('keeps prior visible sections and result count stable while query refresh is in flight', () => {
    vi.mocked(useGlobalSearch)
      .mockReturnValueOnce(
        buildGlobalSearchResults({
        podcastSection: makeSection([
          makeSearchPodcast({
            podcastItunesId: 'pod-1',
            title: 'Apple Podcast',
            author: 'Host',
          }),
        ]),
        episodeSection: makeSection([]),
        localSection: makeSection([priorLocalResult]),
        isLoading: false,
        isEmpty: false,
        })
      )
      .mockReturnValue(
        buildGlobalSearchResults({
        podcastSection: makeSection([
          makeSearchPodcast({
            podcastItunesId: 'pod-1',
            title: 'Apple Podcast',
            author: 'Host',
          }),
        ]),
        episodeSection: makeSection([], 'loading'),
        localSection: makeSection([priorLocalResult]),
        isLoading: true,
        isEmpty: false,
        })
      )

    const { rerender } = render(<SearchPage />)

    expect(screen.getByText('searchResultsCount:2')).toBeDefined()
    expect(screen.getByText('Apple Podcast')).toBeDefined()
    expect(screen.getByText('Prior Result')).toBeDefined()

    mockSearchState.q = 'apple updated'
    rerender(<SearchPage />)

    expect(screen.getByText('searchResultsCount:2')).toBeDefined()
    expect(screen.getByText('Apple Podcast')).toBeDefined()
    expect(screen.getByText('Prior Result')).toBeDefined()
    expect(screen.getByTestId('spinner')).toBeDefined()
    expect(screen.queryByTestId('initial-loading')).toBeNull()
    expect(screen.queryByText('searchNoResults')).toBeNull()
  })

  it('shows empty only after a loading refresh settles into fully empty ready sections', () => {
    vi.mocked(useGlobalSearch)
      .mockReturnValueOnce(
        buildGlobalSearchResults({
        podcastSection: makeSection([
          makeSearchPodcast({
            podcastItunesId: 'pod-1',
            title: 'Apple Podcast',
            author: 'Host',
          }),
        ]),
        episodeSection: makeSection([]),
        localSection: makeSection([priorLocalResult]),
        isLoading: false,
        isEmpty: false,
        })
      )
      .mockReturnValueOnce(
        buildGlobalSearchResults({
        podcastSection: makeSection([], 'loading'),
        episodeSection: makeSection([], 'loading'),
        localSection: makeSection([], 'loading'),
        isLoading: true,
        isEmpty: false,
        })
      )
      .mockReturnValue(
        buildGlobalSearchResults({
        podcastSection: makeSection([]),
        episodeSection: makeSection([]),
        localSection: makeSection([]),
        isLoading: false,
        isEmpty: true,
        })
      )

    const { rerender } = render(<SearchPage />)

    expect(screen.getByText('Apple Podcast')).toBeDefined()
    expect(screen.getByText('Prior Result')).toBeDefined()

    mockSearchState.q = 'no-match'
    rerender(<SearchPage />)

    expect(screen.getByTestId('initial-loading')).toBeDefined()
    expect(screen.queryByText('searchNoResults')).toBeNull()

    rerender(<SearchPage />)

    expect(screen.getByText('searchNoResults')).toBeDefined()
    expect(screen.queryByTestId('initial-loading')).toBeNull()
  })

  it('keeps prior local results visible while a local-only refresh is in flight', () => {
    vi.mocked(useGlobalSearch)
      .mockReturnValueOnce(
        buildGlobalSearchResults({
        podcastSection: makeSection([]),
        episodeSection: makeSection([]),
        localSection: makeSection([priorLocalResult]),
        isLoading: false,
        isEmpty: false,
        })
      )
      .mockReturnValue(
        buildGlobalSearchResults({
        podcastSection: makeSection([]),
        episodeSection: makeSection([]),
        localSection: makeSection([priorLocalResult], 'loading'),
        isLoading: true,
        isEmpty: false,
        })
      )

    const { rerender } = render(<SearchPage />)

    expect(screen.getByText('searchResultsCount:1')).toBeDefined()
    expect(screen.getByText('Prior Result')).toBeDefined()

    mockSearchState.q = 'local updated'
    rerender(<SearchPage />)

    expect(screen.getByText('searchResultsCount:1')).toBeDefined()
    expect(screen.getByText('Prior Result')).toBeDefined()
    expect(screen.getByTestId('spinner')).toBeDefined()
    expect(screen.queryByTestId('initial-loading')).toBeNull()
    expect(screen.queryByText('searchNoResults')).toBeNull()
  })
})

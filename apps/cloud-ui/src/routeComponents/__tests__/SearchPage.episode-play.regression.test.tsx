import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../__tests__/queryClient'
import { makeSearchEpisode } from '../../lib/discovery/__tests__/fixtures'
import SearchPage from '../SearchPage'

const navigateMock = vi.fn()
const playSearchEpisodeMock = vi.fn()
const mockSearchState = { q: 'search-term' }
const mockGlobalSearchState: {
  podcasts: Record<string, unknown>[]
  episodes: Record<string, unknown>[]
  local: Record<string, unknown>[]
  isLoading: boolean
  isEmpty: boolean
} = {
  podcasts: [],
  episodes: [],
  local: [],
  isLoading: false,
  isEmpty: false,
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => mockSearchState,
  Link: ({
    children,
    to,
    params,
    search,
    state,
    className,
  }: {
    children: ReactNode
    to?: string
    params?: Record<string, string>
    search?: unknown
    state?: unknown
    className?: string
  }) => (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.preventDefault()
        navigateMock({ to, params, search, state })
      }}
    >
      {children}
    </button>
  ),
}))

vi.mock('../../components/GlobalSearch/SearchResultItem', () => ({
  SearchResultItem: ({ onClick, title }: { onClick?: () => void; title: string }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}))

vi.mock('../../components/PodcastCard/PodcastCard', () => ({
  PodcastCard: ({ onClick, title }: { onClick?: () => void; title: string }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}))

vi.mock('../../components/PodcastGrid', () => ({
  PodcastGrid: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    className,
    asChild,
    ...props
  }: {
    children: ReactNode
    onClick?: () => void
    className?: string
    asChild?: boolean
    [key: string]: unknown
  }) => {
    if (asChild) {
      return <>{children}</>
    }
    return (
      <button type="button" onClick={onClick} className={className} {...props}>
        {children}
      </button>
    )
  },
}))

vi.mock('../../components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../components/ui/loading-spinner', () => ({
  LoadingPage: () => <div>loading</div>,
}))

vi.mock('../../hooks/useGlobalSearch', () => ({
  useGlobalSearch: () => mockGlobalSearchState,
}))

vi.mock('../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playSearchEpisode: playSearchEpisodeMock,
  }),
}))

vi.mock('../../lib/localSearchActions', () => ({
  executeLocalSearchAction: vi.fn(),
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setAudioUrl: vi.fn(),
      loadAudioBlob: vi.fn(),
      play: vi.fn(),
      setSessionId: vi.fn(),
      setPlaybackTrackId: vi.fn(),
    }),
}))

vi.mock('../../store/transcriptStore', () => ({
  useTranscriptStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setSubtitles: vi.fn(),
    }),
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
      favorites: [],
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
    }),
}))

vi.mock('../../hooks/useEpisodeStatus', () => ({
  useEpisodeStatus: () => ({ playable: true }),
}))

describe('SearchPage episode play regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchState.q = 'search-term'
    mockGlobalSearchState.podcasts = []
    mockGlobalSearchState.local = []
    mockGlobalSearchState.isLoading = false
    mockGlobalSearchState.isEmpty = false
    mockGlobalSearchState.episodes = [
      makeSearchEpisode({
        podcastItunesId: '7',
        title: 'Episode Name',
        showTitle: 'Show Name',
        episodeUrl: 'https://example.com/audio.mp3',
        releaseDate: '2026-01-01T00:00:00Z',
        shortDescription: 'desc',
        artwork: 'https://example.com/artwork-600.jpg',
        trackTimeMillis: 61000,
      }),
    ]
  })

  it('keeps artwork play button on direct playback path', () => {
    render(<SearchPage />, { wrapper: createQueryClientWrapper() })
    fireEvent.click(screen.getByRole('button', { name: 'ariaPlayEpisode' }))

    expect(playSearchEpisodeMock).toHaveBeenCalledTimes(1)
    expect(playSearchEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Episode Name',
        episodeUrl: 'https://example.com/audio.mp3',
      }),
      'us'
    )
    expect(navigateMock).not.toHaveBeenCalled()
  })
})

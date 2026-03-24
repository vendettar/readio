import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SearchPage from '../SearchPage'

const navigateMock = vi.fn()
const executeLocalSearchActionMock = vi.fn()
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
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => mockSearchState,
}))

vi.mock('../../components/GlobalSearch/SearchEpisodeItem', () => ({
  SearchEpisodeItem: ({
    episode,
    onPlay,
  }: {
    episode: { trackName: string }
    onPlay: () => void
  }) => (
    <button type="button" aria-label={`play-${episode.trackName}`} onClick={onPlay}>
      play
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
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
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
  executeLocalSearchAction: (...args: unknown[]) => executeLocalSearchActionMock(...args),
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setAudioUrl: vi.fn(),
      loadAudioBlob: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      setSessionId: vi.fn(),
      setPlaybackTrackId: vi.fn(),
      setEpisodeMetadata: vi.fn(),
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
    }),
}))

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchState.q = 'search-term'
    mockGlobalSearchState.podcasts = []
    mockGlobalSearchState.episodes = []
    mockGlobalSearchState.local = []
    mockGlobalSearchState.isLoading = false
    mockGlobalSearchState.isEmpty = false
  })

  it('wires episode play callback to playSearchEpisode', () => {
    const episode = {
      providerEpisodeId: 42,
      providerPodcastId: 7,
      episodeGuid: 'episode-guid-42',
      trackName: 'Episode Name',
      feedUrl: 'https://example.com/feed.xml',
    }
    mockGlobalSearchState.episodes = [episode]

    render(<SearchPage />)

    fireEvent.click(screen.getByRole('button', { name: 'play-Episode Name' }))

    expect(playSearchEpisodeMock).toHaveBeenCalledWith(
      episode,
      'https://example.com/feed.xml',
      'us'
    )
    expect(navigateMock).not.toHaveBeenCalled()
    expect(executeLocalSearchActionMock).not.toHaveBeenCalled()
  })
})

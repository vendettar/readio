import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import type { EditorPickPodcast, TopEpisode, TopPodcast } from '../../lib/discovery'
import DownloadsPage from '../DownloadsPage'
import ExplorePage from '../ExplorePage'
import FavoritesPage from '../FavoritesPage'
import HistoryPage from '../HistoryPage'

function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

vi.mock('../../components/EpisodeRow', () => ({
  EpisodeListItem: ({ model }: { model: { title: string } }) => (
    <div data-testid="episode-list-item">
      <span>{model.title}</span>
    </div>
  ),
  EpisodeListSkeleton: vi.fn(() => <div data-testid="skeleton" />),
  fromFavorite: ({ favorite }: { favorite: { title: string } }) => ({
    title: favorite.title,
  }),
  fromPlaybackSession: ({ session }: { session: { title: string } }) => ({ title: session.title }),
}))

import { useTranslation } from 'react-i18next'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import * as DownloadService from '../../lib/downloadService'
import { useExploreStore } from '../../store/exploreStore'
import { useHistoryStore } from '../../store/historyStore'
import { usePlayerStore } from '../../store/playerStore'

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({ q: '' }),
  Link: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../components/layout', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}))

vi.mock('../../components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../components/OfflineBanner', () => ({
  OfflineBanner: () => null,
}))

vi.mock('../../components/Files/ViewControlsBar', () => ({
  ViewControlsBar: () => null,
}))

vi.mock('../../components/ui/loading-spinner', () => ({
  LoadingSpinner: () => <div data-testid="spinner" />,
}))

vi.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(),
}))

vi.mock('../../hooks/useSubscriptionMap', () => ({
  useSubscriptionMap: () => new Map(),
}))

// Mock Stores
vi.mock('../../store/historyStore', () => ({
  useHistoryStore: vi.fn(),
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: vi.fn(),
}))

vi.mock('../../store/filesStore', () => ({
  useFilesStore: vi.fn((selector) =>
    selector({
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    })
  ),
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: vi.fn((selector) =>
    selector({
      setAudioUrl: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      setSessionId: vi.fn(),
      setPlaybackTrackId: vi.fn(),
    })
  ),
}))

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: vi.fn((selector) =>
    selector({
      setPlayableContext: vi.fn(),
      toDocked: vi.fn(),
      toMini: vi.fn(),
    })
  ),
}))

vi.mock('../../store/transcriptStore', () => ({
  useTranscriptStore: vi.fn((selector) =>
    selector({
      setSubtitles: vi.fn(),
    })
  ),
}))

// Mock Hooks
vi.mock('../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({ playFavorite: vi.fn() }),
}))

// Mock Download Service & Repository
vi.mock('../../lib/downloadService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/downloadService')>()
  return {
    ...actual,
    getAllDownloadedTracks: vi.fn(),
    subscribeToDownloads: vi.fn(() => vi.fn()),
    useDownloadProgressStore: vi.fn((selector) =>
      selector({
        progressMap: new Map(),
      })
    ),
  }
})

vi.mock('../../lib/repositories/DownloadsRepository', () => ({
  DownloadsRepository: {
    getTrackArtworkBlob: vi.fn(),
    getTrackSubtitles: vi.fn(),
  },
  subscribeToDownloadSubtitles: vi.fn(() => vi.fn()),
}))

const useEditorPicksMock = vi.hoisted(() =>
  vi.fn<() => EditorPickQueryResult>(() => ({ data: [], isLoading: false }))
)
const useTopPodcastsMock = vi.hoisted(() =>
  vi.fn<() => TopPodcastQueryResult>(() => ({ data: [], isLoading: false }))
)
const useTopEpisodesMock = vi.hoisted(() =>
  vi.fn<() => TopEpisodeQueryResult>(() => ({ data: [], isLoading: false }))
)

vi.mock('../../hooks/useDiscoveryPodcasts', () => ({
  useEditorPicks: useEditorPicksMock,
  useTopPodcasts: useTopPodcastsMock,
  useTopEpisodes: useTopEpisodesMock,
}))

type TranslationFn = (key: string) => string
type MockI18n = { language: string; resolvedLanguage?: string }
type MockTranslationResponse = ReturnType<typeof useTranslation>

type ExploreStoreState = {
  country?: string
  favorites: Array<{ key: string; title: string; audioUrl: string }>
  favoritesLoaded: boolean
  removeFavorite: ReturnType<typeof vi.fn>
  addFavorite?: ReturnType<typeof vi.fn>
}

type HistoryStoreState = {
  sessions: Array<{
    id: string
    title: string
    lastPlayedAt: number
    progress: number
    durationSeconds: number
    source: string
  }>
  artworkBlobs: Record<string, unknown>
  isLoading: boolean
  loadSessions: ReturnType<typeof vi.fn>
  resolveArtworkForSession: ReturnType<typeof vi.fn>
}

type PlayerStoreState = {
  setAudioUrl: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  pause?: ReturnType<typeof vi.fn>
  setSessionId?: ReturnType<typeof vi.fn>
  setPlaybackTrackId?: ReturnType<typeof vi.fn>
}

type DownloadedTrack = Awaited<ReturnType<typeof DownloadService.getAllDownloadedTracks>>[number]
type TopPodcastQueryResult = { data: TopPodcast[]; isLoading: boolean }
type EditorPickQueryResult = { data: EditorPickPodcast[]; isLoading: boolean }
type TopEpisodeQueryResult = { data: TopEpisode[]; isLoading: boolean }

function createStoreSelectorMock<TState extends object>(state: TState) {
  return ((selector: (value: TState) => unknown) => selector(state)) as unknown
}

function createTranslationResponse(t: TranslationFn, i18n: MockI18n): MockTranslationResponse {
  return Object.assign([t, i18n, true] as [TranslationFn, MockI18n, boolean], {
    t,
    i18n,
    ready: true,
  }) as unknown as MockTranslationResponse
}

describe('Library Route Family SWR (Stale-While-Revalidate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorPicksMock.mockReturnValue({ data: [], isLoading: false })
    useTopPodcastsMock.mockReturnValue({ data: [], isLoading: false })
    useTopEpisodesMock.mockReturnValue({ data: [], isLoading: false })
    const t = (key: string) => key
    const i18n = { language: 'en', resolvedLanguage: 'en' }
    const mockResponse = createTranslationResponse(t, i18n)
    vi.mocked(useTranslation).mockReturnValue(mockResponse)
    vi.mocked(useNetworkStatus).mockReturnValue({ isOnline: true })
    vi.mocked(useExploreStore).mockImplementation(
      createStoreSelectorMock<ExploreStoreState>({
        favorites: [],
        favoritesLoaded: true,
        removeFavorite: vi.fn(),
        addFavorite: vi.fn(),
      }) as typeof useExploreStore
    )
  })

  it('HistoryPage: keeps prior sessions visible while loading', () => {
    vi.mocked(useHistoryStore).mockImplementation(
      createStoreSelectorMock<HistoryStoreState>({
        sessions: [
          {
            id: '1',
            title: 'Prior Session',
            lastPlayedAt: Date.now(),
            progress: 0,
            durationSeconds: 100,
            source: 'explore',
          },
        ],
        artworkBlobs: {},
        isLoading: true,
        loadSessions: vi.fn(),
        resolveArtworkForSession: vi.fn(),
      }) as typeof useHistoryStore
    )

    render(<HistoryPage />)

    expect(screen.getByText('Prior Session')).toBeDefined()
    expect(screen.getByText('loading')).toBeDefined() // Revalidation indicator
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })

  it('FavoritesPage: keeps prior favorites visible while loading', () => {
    vi.mocked(useExploreStore).mockImplementation(
      createStoreSelectorMock<ExploreStoreState>({
        favorites: [{ key: 'fav-1', title: 'Prior Favorite', audioUrl: 'url' }],
        favoritesLoaded: false,
        removeFavorite: vi.fn(),
      }) as typeof useExploreStore
    )

    render(<FavoritesPage />)

    expect(screen.getByText('Prior Favorite')).toBeDefined()
    expect(screen.getByText('loading')).toBeDefined()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })

  it('DownloadsPage: proves SWR by preserving content during revalidation', async () => {
    let downloadListener: (() => void) | undefined
    vi.mocked(DownloadService.subscribeToDownloads).mockImplementation((cb) => {
      downloadListener = cb
      return vi.fn()
    })

    // 1. Initial Load: Provide tracks
    vi.mocked(DownloadService.getAllDownloadedTracks).mockResolvedValue([
      {
        id: 'track-1',
        name: 'Initial Download',
        sourceUrlNormalized: 'url',
        sizeBytes: 1000,
        sourcePodcastTitle: 'Podcast',
      } as DownloadedTrack,
    ])

    // Mock store used by DownloadedTrackItem
    vi.mocked(usePlayerStore).mockImplementation(
      createStoreSelectorMock<PlayerStoreState>({
        setAudioUrl: vi.fn(),
        play: vi.fn(),
      }) as typeof usePlayerStore
    )

    render(<DownloadsPage />)

    // Wait for the tracks to actually render (initial load finished)
    expect(await screen.findByText('Initial Download')).toBeDefined()
    // On the very first mount, it's okay if a skeleton appeared briefly (initial load)
    // but now that tracks are here, the skeleton should be gone from the DOM.
    expect(screen.queryByTestId('skeleton')).toBeNull()

    // 2. Mock a second load that hangs (revalidation)
    let resolveSecondLoad: ((val: DownloadedTrack[]) => void) | undefined
    const secondLoadPromise = new Promise<DownloadedTrack[]>((resolve) => {
      resolveSecondLoad = resolve
    })
    vi.mocked(DownloadService.getAllDownloadedTracks).mockReturnValue(secondLoadPromise)

    // 3. Trigger revalidation via the subscriber
    if (downloadListener) {
      await act(async () => {
        downloadListener?.()
      })
    }

    // 4. Assert DOM continuity: Prior content STAYS visible during the second load
    expect(screen.queryByText('Initial Download')).not.toBeNull()

    // 4b. Assert Revalidation Feedback: Inline loading indicator appears
    expect(screen.getByText('loading')).toBeDefined()

    // 5. Assert: Skeleton does NOT replace content during second load (SWR contract)
    expect(screen.queryByTestId('skeleton')).toBeNull()

    // 6. Resolve the second load with new content
    await act(async () => {
      resolveSecondLoad?.([
        {
          id: 'track-1',
          name: 'Initial Download',
          sourceUrlNormalized: 'url',
          sizeBytes: 1000,
          sourcePodcastTitle: 'Podcast',
        } as DownloadedTrack,
        {
          id: 'track-2',
          name: 'New Download',
          sourceUrlNormalized: 'url2',
          sizeBytes: 2000,
          sourcePodcastTitle: 'Podcast',
        } as DownloadedTrack,
      ])
    })

    expect(await screen.findByText('New Download')).toBeDefined()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })
})

describe('ExplorePage i18n Fix', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  })

  it('does not use hardcoded English fallback for offline explanation', () => {
    vi.mocked(useExploreStore).mockImplementation(
      createStoreSelectorMock<ExploreStoreState>({
        country: 'US',
        favorites: [],
        favoritesLoaded: true,
        removeFavorite: vi.fn(),
      }) as typeof useExploreStore
    )

    vi.mocked(useNetworkStatus).mockReturnValue({ isOnline: false })

    const tSpy = vi.fn((key) => key)
    const i18n = { language: 'en' }
    const mockResponse = createTranslationResponse(tSpy, i18n)
    vi.mocked(useTranslation).mockReturnValue(mockResponse)

    render(<ExplorePage />, { wrapper })

    expect(tSpy).toHaveBeenCalledWith('offline.explanation')
    const call = tSpy.mock.calls.find((c) => c[0] === 'offline.explanation')
    expect(call?.length).toBe(1)
  })

  it('renders three discovery sections including editor picks', () => {
    vi.mocked(useExploreStore).mockImplementation(
      createStoreSelectorMock<ExploreStoreState>({
        country: 'US',
        favorites: [],
        favoritesLoaded: true,
        removeFavorite: vi.fn(),
      }) as typeof useExploreStore
    )

    vi.mocked(useNetworkStatus).mockReturnValue({ isOnline: true })

    const tSpy = vi.fn((key) => key)
    const i18n = { language: 'en' }
    const mockResponse = createTranslationResponse(tSpy, i18n)
    vi.mocked(useTranslation).mockReturnValue(mockResponse)

    const editorPicks: EditorPickPodcast[] = [
      {
        title: 'Editor Pick',
        author: 'Host',
        artwork: 'https://example.com/pick.jpg',
        description: 'Description',
        feedUrl: normalizeFeedUrl('https://example.com/pick'),
        lastUpdateTime: 1700000000000,
        podcastItunesId: '100',
        episodeCount: 10,
        language: 'en',
        genres: ['Technology'],
      },
    ]
    const topShows: TopPodcast[] = [
      {
        title: 'Top Show',
        author: 'Host',
        artwork: 'https://example.com/show.jpg',
        genres: ['Comedy'],
        podcastItunesId: '101',
      },
    ]
    const topEpisodes: TopEpisode[] = [
      {
        title: 'Top Episode',
        author: 'The New York Times',
        artwork: 'https://example.com/episode.jpg',
        genres: ['Technology'],
        podcastItunesId: '102',
      },
    ]

    useEditorPicksMock.mockReturnValue({
      data: editorPicks,
      isLoading: false,
    })
    useTopPodcastsMock.mockReturnValue({
      data: topShows,
      isLoading: false,
    })
    useTopEpisodesMock.mockReturnValue({
      data: topEpisodes,
      isLoading: false,
    })

    render(<ExplorePage />, { wrapper })

    expect(screen.getByText('editorPicksTitle')).toBeDefined()
    expect(screen.getByText('topShowsTitle')).toBeDefined()
    expect(screen.getByText('topEpisodesTitle')).toBeDefined()
  })
})

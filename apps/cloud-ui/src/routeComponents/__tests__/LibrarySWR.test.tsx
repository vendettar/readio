import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DownloadsPage from '../DownloadsPage'
import ExplorePage from '../ExplorePage'
import FavoritesPage from '../FavoritesPage'
import HistoryPage from '../HistoryPage'

vi.mock('../../components/EpisodeRow', () => ({
  EpisodeListItem: ({ model }: { model: { title: string } }) => (
    <div data-testid="episode-list-item">
      <span>{model.title}</span>
    </div>
  ),
  EpisodeListSkeleton: vi.fn(() => <div data-testid="skeleton" />),
  fromFavorite: ({ favorite }: /* biome-ignore lint/suspicious/noExplicitAny: mock */ any) => ({
    title: favorite.title,
  }),
  fromPlaybackSession: ({
    session,
  }: /* biome-ignore lint/suspicious/noExplicitAny: mock */ any) => ({ title: session.title }),
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
  const actual = await importOriginal</* biome-ignore lint/suspicious/noExplicitAny: mock */ any>()
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
}))

vi.mock('../../hooks/useDiscoveryPodcasts', () => ({
  useEditorPicks: () => ({ data: [], isLoading: false }),
  useTopPodcasts: () => ({ data: [], isLoading: false }),
  useTopEpisodes: () => ({ data: [], isLoading: false }),
}))

describe('Library Route Family SWR (Stale-While-Revalidate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const t = (key: string) => key
    const i18n = { language: 'en', resolvedLanguage: 'en' }
    const mockResponse = Object.assign([t, i18n, true], { t, i18n, ready: true })
    vi.mocked(useTranslation).mockReturnValue(
      mockResponse as /* biome-ignore lint/suspicious/noExplicitAny: mock */ any
    )
    vi.mocked(useNetworkStatus).mockReturnValue({ isOnline: true })
    vi.mocked(useExploreStore).mockImplementation(
      (selector: /* biome-ignore lint/suspicious/noExplicitAny: mock */ any) =>
        selector({
          favorites: [],
          favoritesLoaded: true,
          removeFavorite: vi.fn(),
          addFavorite: vi.fn(),
        })
    )
  })

  it('HistoryPage: keeps prior sessions visible while loading', () => {
    vi.mocked(useHistoryStore).mockImplementation(
      (selector: /* biome-ignore lint/suspicious/noExplicitAny: mock */ any) =>
        selector({
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
        })
    )

    render(<HistoryPage />)

    expect(screen.getByText('Prior Session')).toBeDefined()
    expect(screen.getByText('loading')).toBeDefined() // Revalidation indicator
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })

  it('FavoritesPage: keeps prior favorites visible while loading', () => {
    vi.mocked(useExploreStore).mockImplementation(
      (selector: /* biome-ignore lint/suspicious/noExplicitAny: mock */ any) =>
        selector({
          favorites: [{ key: 'fav-1', title: 'Prior Favorite', audioUrl: 'url' }],
          favoritesLoaded: false, // implies isInitialLoading is true
          removeFavorite: vi.fn(),
        })
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
      } as /* biome-ignore lint/suspicious/noExplicitAny: mock */ any,
    ])

    // Mock store used by DownloadedTrackItem
    vi.mocked(usePlayerStore).mockImplementation(
      (selector: /* biome-ignore lint/suspicious/noExplicitAny: mock */ any) =>
        selector({
          setAudioUrl: vi.fn(),
          play: vi.fn(),
        })
    )

    render(<DownloadsPage />)

    // Wait for the tracks to actually render (initial load finished)
    expect(await screen.findByText('Initial Download')).toBeDefined()
    // On the very first mount, it's okay if a skeleton appeared briefly (initial load)
    // but now that tracks are here, the skeleton should be gone from the DOM.
    expect(screen.queryByTestId('skeleton')).toBeNull()

    // 2. Mock a second load that hangs (revalidation)
    let resolveSecondLoad:
      | ((val: /* biome-ignore lint/suspicious/noExplicitAny: mock */ any[]) => void)
      | undefined
    const secondLoadPromise = new Promise<
      /* biome-ignore lint/suspicious/noExplicitAny: mock */ any[]
    >((resolve) => {
      resolveSecondLoad = resolve
    })
    vi.mocked(DownloadService.getAllDownloadedTracks).mockReturnValue(
      secondLoadPromise as /* biome-ignore lint/suspicious/noExplicitAny: mock */ any
    )

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
        } as /* biome-ignore lint/suspicious/noExplicitAny: mock */ any,
        {
          id: 'track-2',
          name: 'New Download',
          sourceUrlNormalized: 'url2',
          sizeBytes: 2000,
          sourcePodcastTitle: 'Podcast',
        } as /* biome-ignore lint/suspicious/noExplicitAny: mock */ any,
      ])
    })

    expect(await screen.findByText('New Download')).toBeDefined()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })
})

describe('ExplorePage i18n Fix', () => {
  it('does not use hardcoded English fallback for offline explanation', () => {
    vi.mocked(useExploreStore).mockImplementation(
      (selector: /* biome-ignore lint/suspicious/noExplicitAny: mock */ any) =>
        selector({
          country: 'US',
        })
    )

    vi.mocked(useNetworkStatus).mockReturnValue({ isOnline: false })

    const tSpy = vi.fn((key) => key)
    const i18n = { language: 'en' }
    const mockResponse = Object.assign([tSpy, i18n, true], { t: tSpy, i18n, ready: true })
    vi.mocked(useTranslation).mockReturnValue(
      mockResponse as /* biome-ignore lint/suspicious/noExplicitAny: mock */ any
    )

    render(<ExplorePage />)

    expect(tSpy).toHaveBeenCalledWith('offline.explanation')
    const call = tSpy.mock.calls.find((c) => c[0] === 'offline.explanation')
    expect(call?.length).toBe(1)
  })
})

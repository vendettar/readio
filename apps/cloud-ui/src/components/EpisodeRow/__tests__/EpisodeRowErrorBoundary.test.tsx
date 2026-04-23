import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../__tests__/queryClient'
import type { FeedEpisode, Podcast } from '../../../lib/discovery'
import { EpisodeRow } from '../EpisodeRow'

const playEpisodeMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({}),
}))

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

// Mock format relative time to avoid i18n circular dependency issues in test environment
vi.mock('../../../lib/dateUtils', () => ({
  formatRelativeTime: () => '2 DAYS AGO',
  formatDuration: () => '10 M',
}))

vi.mock('../../../lib/i18nUtils', () => ({
  translate: (key: string) => key,
}))

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: (...args: unknown[]) => playEpisodeMock(...args),
  }),
}))

vi.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({
    isOnline: true,
  }),
}))

vi.mock('../../../lib/player/remotePlayback', () => ({
  canPlayRemoteStreamWithoutTranscript: () => true,
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      isFavorited: vi.fn(() => false),
    }),
}))

vi.mock('../../ui/overflow-menu', () => ({
  OverflowMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}))

// Mock InteractiveTitle to throw error conditionally
vi.mock('../../interactive/InteractiveTitle', () => {
  return {
    InteractiveTitle: ({ title }: { title: string }) => {
      if (title === 'CRASH_ME') {
        throw new Error('Test Crash Inside EpisodeRow')
      }
      return <div data-testid="interactive-title">{title}</div>
    },
  }
})

// Build minimal props
const buildEpisode = (title: string, id: string): FeedEpisode => ({
  episodeGuid: id,
  title,
  description: 'Test Desc',
  duration: 60,
  pubDate: new Date().toISOString(),
  audioUrl: `http://test.com/${id}.mp3`,
})

const mockPodcast: Podcast = {
  podcastItunesId: '101',
  title: 'Test Podcast',
  feedUrl: 'http://test.com/feed.xml',
  author: 'Test Artist',
  artwork: 'http://test.com/art.jpg',
  description: 'Test description',
  lastUpdateTime: 1613394044,
  episodeCount: 50,
  language: 'en',
  genres: ['Technology'],
}

describe('EpisodeRowErrorBoundary Integration', () => {
  it('renders play-without-transcript action in overflow menu', () => {
    render(<EpisodeRow episode={buildEpisode('Safe Row 1', '1')} podcast={mockPodcast} />, {
      wrapper: createQueryClientWrapper(),
    })
    expect(screen.getByRole('button', { name: 'playWithoutTranscript' })).toBeDefined()
  })

  it('isolates a crash inside EpisodeRow and prevents parent unmount', () => {
    // Prevent console.error from polluting output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <div data-testid="list-container">
        <EpisodeRow episode={buildEpisode('Safe Row 1', '1')} podcast={mockPodcast} />
        <EpisodeRow episode={buildEpisode('CRASH_ME', '2')} podcast={mockPodcast} />
        <EpisodeRow episode={buildEpisode('Safe Row 3', '3')} podcast={mockPodcast} />
      </div>,
      { wrapper: createQueryClientWrapper() }
    )

    // 1. Verify healthy rows are present
    expect(screen.getByText('Safe Row 1')).toBeDefined()
    expect(screen.getByText('Safe Row 3')).toBeDefined()

    // 2. Verify the crashed row shows fallback UI
    // The fallback button typically says "Retry" (or 'retry' key from i18n mock)
    const retryButtons = screen.getAllByRole('button', { name: /retry/i })
    expect(retryButtons).toHaveLength(1)

    // 3. Verify the healthy parts of the list are still interactive (implied by finding them)
    // We can check calls to logError if we want, but finding the UI is the key integration test.

    consoleSpy.mockRestore()
  })
})

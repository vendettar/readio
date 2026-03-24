import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as EpisodeRow from '../../components/EpisodeRow'
import { type GlobalSearchResults, useGlobalSearch } from '../../hooks/useGlobalSearch'
import SearchPage from '../SearchPage'

const skeletonSpy = vi.spyOn(EpisodeRow, 'EpisodeListSkeleton')

vi.mock('../../hooks/useGlobalSearch')
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({ q: 'apple' }),
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

vi.mock('../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({ playSearchEpisode: vi.fn() }),
}))

describe('SearchPage Loading Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    skeletonSpy.mockClear()
  })

  it('keeps prior results visible while loading refreshed results', () => {
    vi.mocked(useGlobalSearch).mockReturnValue({
      podcasts: [],
      episodes: [],
      local: [
        // biome-ignore lint/suspicious/noExplicitAny: mock
        { id: '1', title: 'Prior Result', type: 'file', subtitle: '', badges: [], data: {} as any },
      ],
      isLoading: true,
      isEmpty: false,
    } as GlobalSearchResults)

    render(<SearchPage />)

    expect(screen.getByText('Prior Result')).toBeDefined()
    expect(screen.getByTestId('spinner')).toBeDefined()
    expect(screen.getByText('loading')).toBeDefined()
    expect(skeletonSpy).not.toHaveBeenCalled()
  })

  it('shows skeleton and disables nested announcement when loading without results', () => {
    vi.mocked(useGlobalSearch).mockReturnValue({
      podcasts: [],
      episodes: [],
      local: [],
      isLoading: true,
      isEmpty: true,
    } as GlobalSearchResults)

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
})

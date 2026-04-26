import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TopEpisodeResolutionPage from '../TopEpisodeResolutionPage'

const navigateMock = vi.fn()
const resolveEpisodeByTitleMock = vi.fn()

function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

let routeCountry = 'us'
let routePodcastId = '12345'
let routeSearch = { title: 'Top Episode' }

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ country: routeCountry, id: routePodcastId }),
  useSearch: () => routeSearch,
}))

vi.mock('@/lib/routes/episodeResolver', () => ({
  resolveEpisodeByTitle: (...args: unknown[]) => resolveEpisodeByTitleMock(...args),
}))

describe('TopEpisodeResolutionPage', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    resolveEpisodeByTitleMock.mockReset()
    routeCountry = 'us'
    routePodcastId = '12345'
    routeSearch = { title: 'Top Episode' }
  })

  it('renders a loading skeleton while resolving', () => {
    resolveEpisodeByTitleMock.mockReturnValue(new Promise(() => {}))

    render(<TopEpisodeResolutionPage />, { wrapper })

    expect(screen.queryByText('Opening...')).not.toBeNull()
    expect(screen.queryByText('Loading episode...')).not.toBeNull()
  })

  it('replace-navigates to the canonical episode route when resolution succeeds', async () => {
    resolveEpisodeByTitleMock.mockResolvedValue({
      type: 'episode',
      route: {
        to: '/podcast/$country/$id/$episodeKey',
        params: {
          country: 'us',
          id: '12345',
          episodeKey: 'compact-key',
        },
      },
    })

    render(<TopEpisodeResolutionPage />, { wrapper })

    await waitFor(() => {
      expect(resolveEpisodeByTitleMock).toHaveBeenCalledWith({
        queryClient: expect.any(QueryClient),
        country: 'us',
        podcastItunesId: '12345',
        targetTitle: 'Top Episode',
        signal: expect.any(AbortSignal),
      })
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/podcast/$country/$id/$episodeKey',
        params: {
          country: 'us',
          id: '12345',
          episodeKey: 'compact-key',
        },
        replace: true,
      })
    })
  })

  it('replace-navigates to the canonical show route when resolution falls back', async () => {
    resolveEpisodeByTitleMock.mockResolvedValue({
      type: 'show',
      route: {
        to: '/podcast/$country/$id',
        params: {
          country: 'us',
          id: '12345',
        },
      },
    })

    render(<TopEpisodeResolutionPage />, { wrapper })

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/podcast/$country/$id',
        params: {
          country: 'us',
          id: '12345',
        },
        replace: true,
      })
    })
  })
})

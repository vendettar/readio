import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopEpisode } from '../../../lib/discovery'
import { PodcastEpisodesGrid } from '../PodcastEpisodesGrid'

const animatedListSpy = vi.fn()
const shellSpy = vi.fn()
const navigateMock = vi.fn()

function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ country: 'us' }),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {},
}))

vi.mock('../../../hooks/useCarouselLayout', () => ({
  useCarouselLayout: () => ({
    scrollRef: { current: null },
    itemWidth: 280,
    visibleCount: 3,
    canScrollLeft: true,
    canScrollRight: true,
    handleScroll: vi.fn(),
    updateScrollButtons: vi.fn(),
  }),
}))

vi.mock('../CarouselShell', () => ({
  CarouselShell: (props: Record<string, unknown>) => {
    shellSpy(props)
    return <div>{props.children as ReactNode}</div>
  },
}))

vi.mock('../../bits/AnimatedList', () => ({
  AnimatedList: ({
    items,
    renderItem,
  }: {
    items: unknown[]
    renderItem: (item: unknown, index: number) => ReactNode
  }) => {
    animatedListSpy(items)
    return <>{items.map((item, index) => renderItem(item, index))}</>
  },
}))

vi.mock('../../interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      artwork
    </button>
  ),
}))

vi.mock('../../interactive/InteractiveTitle', () => ({
  InteractiveTitle: ({ title, onClick }: { title: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}))

describe('PodcastEpisodesGrid', () => {
  beforeEach(() => {
    animatedListSpy.mockClear()
    shellSpy.mockClear()
    navigateMock.mockClear()
  })

  it('keeps ROWS=3 grouping parity and passes grid navigation config', () => {
    render(
      <PodcastEpisodesGrid
        episodes={
          [
            {
              title: 'Episode 1',
              author: 'The New York Times',
              artwork: 'https://example.com/e1.jpg',
              genres: [],
              podcastItunesId: '1',
            },
            {
              title: 'Episode 2',
              author: 'The New York Times',
              artwork: 'https://example.com/e2.jpg',
              genres: [],
              podcastItunesId: '1',
            },
            {
              title: 'Episode 3',
              author: 'The New York Times',
              artwork: 'https://example.com/e3.jpg',
              genres: [],
              podcastItunesId: '1',
            },
            {
              title: 'Episode 4',
              author: 'The New York Times',
              artwork: 'https://example.com/e4.jpg',
              genres: [],
              podcastItunesId: '1',
            },
          ] satisfies TopEpisode[]
        }
      />,
      { wrapper }
    )

    expect(animatedListSpy).toHaveBeenCalledTimes(2)
    expect((animatedListSpy.mock.calls[0]?.[0] as unknown[]).length).toBe(3)
    expect((animatedListSpy.mock.calls[1]?.[0] as unknown[]).length).toBe(1)

    const shellProps = shellSpy.mock.calls[shellSpy.mock.calls.length - 1]?.[0] as {
      navParentGroupName?: string
      navHeightClassName?: string
      navTopClassName?: string
    }
    expect(shellProps.navParentGroupName).toBe('grid')
    expect(shellProps.navTopClassName).toBe('top-1/2')
    expect(shellProps.navHeightClassName).toBe('h-20')

    expect(screen.queryByText('Episode 1')).not.toBeNull()
    expect(screen.queryByText('Episode 4')).not.toBeNull()
  })

  it('shows the podcast title but not the top-episode genre label', () => {
    render(
      <PodcastEpisodesGrid
        episodes={
          [
            {
              title: 'Episode 1',
              author: 'The New York Times',
              artwork: 'https://example.com/e1.jpg',
              genres: ['Technology'],
              podcastItunesId: '1',
            },
          ] satisfies TopEpisode[]
        }
      />,
      { wrapper }
    )

    expect(screen.queryByText('The New York Times')).not.toBeNull()
    expect(screen.queryByText('Technology')).toBeNull()
  })

  it('navigates immediately to the transitional top-episode resolver route', async () => {
    render(
      <PodcastEpisodesGrid
        episodes={
          [
            {
              title: 'Episode 1',
              author: 'The New York Times',
              artwork: 'https://example.com/e1.jpg',
              genres: [],
              podcastItunesId: '1',
            },
          ] satisfies TopEpisode[]
        }
      />,
      { wrapper }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Episode 1' }))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/podcast/$country/$id/top-episode',
        params: {
          country: 'us',
          id: '1',
        },
        search: {
          title: 'Episode 1',
        },
      })
    })
  })
})

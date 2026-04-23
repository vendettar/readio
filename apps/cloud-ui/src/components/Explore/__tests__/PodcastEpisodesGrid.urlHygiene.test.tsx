import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PodcastEpisodesGrid } from '../PodcastEpisodesGrid'

const navigateMock = vi.fn()

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

vi.mock('../../../hooks/useCarouselLayout', () => ({
  useCarouselLayout: () => ({
    scrollRef: { current: null },
    itemWidth: 280,
    visibleCount: 3,
    canScrollLeft: false,
    canScrollRight: false,
    handleScroll: vi.fn(),
    updateScrollButtons: vi.fn(),
  }),
}))

vi.mock('../../bits/AnimatedList', () => ({
  AnimatedList: ({
    items,
    renderItem,
  }: {
    items: unknown[]
    renderItem: (item: unknown, index: number) => ReactNode
  }) => <>{items.map((item, index) => renderItem(item, index))}</>,
}))

vi.mock('../../interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: (props: { onClick?: () => void }) => {
    return (
      <button type="button" onClick={() => props.onClick?.()}>
        artwork
      </button>
    )
  },
}))

vi.mock('../../interactive/InteractiveTitle', () => ({
  InteractiveTitle: (props: { onClick?: () => void; title?: unknown }) => {
    return (
      <button type="button" onClick={() => props.onClick?.()}>
        {String(props.title ?? '')}
      </button>
    )
  },
}))

vi.mock('../CarouselNavigation', () => ({
  CarouselNavigation: () => null,
}))

describe('PodcastEpisodesGrid navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates directly to the show route using podcastItunesId', async () => {
    render(
      <PodcastEpisodesGrid
        episodes={
          [
            {
              title: 'Top Episode',
              author: 'Host',
              artwork: 'https://example.com/art.jpg',
              podcastItunesId: '12345',
              genres: [],
            },
          ] as never
        }
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Top Episode' }))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/podcast/$country/$id',
        params: {
          country: 'us',
          id: '12345',
        },
      })
    })
  })
})

import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PodcastEpisodesGrid } from '../PodcastEpisodesGrid'

const interactiveTitleProps = vi.fn()
const interactiveArtworkProps = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
  InteractiveArtwork: (props: Record<string, unknown>) => {
    interactiveArtworkProps(props)
    return <div />
  },
}))

vi.mock('../../interactive/InteractiveTitle', () => ({
  InteractiveTitle: (props: Record<string, unknown>) => {
    interactiveTitleProps(props)
    return <div>{String(props.title ?? '')}</div>
  },
}))

vi.mock('../CarouselNavigation', () => ({
  CarouselNavigation: () => null,
}))

describe('PodcastEpisodesGrid URL hygiene', () => {
  it('emits canonical episode routes from structured providerPodcastId without URL parsing', () => {
    render(
      <PodcastEpisodesGrid
        episodes={
          [
            {
              id: 'episode-1',
              name: 'Top Episode',
              artistName: 'Host',
              artworkUrl100: 'https://example.com/art.jpg',
              url: '/non-canonical-top-episode-url',
              providerPodcastId: '12345',
              genres: [],
            },
          ] as never
        }
      />
    )

    const titleCall = interactiveTitleProps.mock.calls[
      interactiveTitleProps.mock.calls.length - 1
    ]?.[0] as {
      to?: string
      search?: unknown
    }
    const artworkCall = interactiveArtworkProps.mock.calls[
      interactiveArtworkProps.mock.calls.length - 1
    ]?.[0] as {
      to?: string
      search?: unknown
      params?: { id?: string }
    }

    expect(titleCall.to).toBe('/$country/podcast/$id/episode/$episodeId')
    expect(artworkCall.to).toBe('/$country/podcast/$id/episode/$episodeId')
    expect(titleCall.search).toBeUndefined()
    expect(artworkCall.search).toBeUndefined()
    expect(artworkCall.params?.id).toBe('12345')
  })
})

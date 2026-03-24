import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PodcastShowsCarousel } from '../PodcastShowsCarousel'

const podcastShowCardSpy = vi.fn()

vi.mock('../../../hooks/useCarouselLayout', () => ({
  useCarouselLayout: () => ({
    scrollRef: { current: null },
    itemWidth: 260,
    visibleCount: 3,
    canScrollLeft: false,
    canScrollRight: false,
    handleScroll: vi.fn(),
    updateScrollButtons: vi.fn(),
  }),
}))

vi.mock('../PodcastShowCard', () => ({
  PodcastShowCard: (props: Record<string, unknown>) => {
    podcastShowCardSpy(props)
    return <div>{String((props.podcast as { name?: string }).name ?? '')}</div>
  },
}))

vi.mock('../CarouselNavigation', () => ({
  CarouselNavigation: () => null,
}))

vi.mock('../../PodcastCard/PodcastCardSkeleton', () => ({
  PodcastCardSkeleton: () => null,
}))

describe('PodcastShowsCarousel transition metadata transport', () => {
  it('passes fromLayoutPrefix via location.state contract', () => {
    render(
      <PodcastShowsCarousel
        podcasts={
          [
            {
              id: '7',
              name: 'Show',
              artistName: 'Host',
              artworkUrl100: 'https://example.com/art.jpg',
            },
          ] as never
        }
        sectionId="top-shows"
      />
    )

    const call = podcastShowCardSpy.mock.calls[podcastShowCardSpy.mock.calls.length - 1]?.[0] as {
      transitionState?: { fromLayoutPrefix: string }
    }

    expect(call.transitionState).toEqual({ fromLayoutPrefix: 'top-shows' })
  })
})

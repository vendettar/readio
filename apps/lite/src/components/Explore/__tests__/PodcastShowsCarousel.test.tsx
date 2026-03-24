import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PodcastShowsCarousel } from '../PodcastShowsCarousel'

const podcastShowCardSpy = vi.fn()
const shellSpy = vi.fn()

vi.mock('../../../hooks/useCarouselLayout', () => ({
  useCarouselLayout: () => ({
    scrollRef: { current: null },
    itemWidth: 260,
    visibleCount: 4,
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

vi.mock('../PodcastShowCard', () => ({
  PodcastShowCard: (props: Record<string, unknown>) => {
    podcastShowCardSpy(props)
    return <div>{String((props.podcast as { name?: string }).name ?? '')}</div>
  },
}))

vi.mock('../../PodcastCard/PodcastCardSkeleton', () => ({
  PodcastCardSkeleton: () => <div data-testid="show-skeleton" />,
}))

describe('PodcastShowsCarousel', () => {
  it('keeps loading skeleton count parity and hides navigation while loading', () => {
    render(<PodcastShowsCarousel podcasts={[]} isLoading />)

    expect(screen.getAllByTestId('show-skeleton')).toHaveLength(4)
    const shellProps = shellSpy.mock.calls[shellSpy.mock.calls.length - 1]?.[0] as {
      showNavigation?: boolean
    }
    expect(shellProps.showNavigation).toBe(false)
  })

  it('passes fromLayoutPrefix transition payload to show cards', () => {
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

    const shellProps = shellSpy.mock.calls[shellSpy.mock.calls.length - 1]?.[0] as {
      showNavigation?: boolean
    }
    expect(shellProps.showNavigation).toBe(true)
  })
})

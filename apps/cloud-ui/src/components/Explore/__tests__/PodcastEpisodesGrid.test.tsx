import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PodcastEpisodesGrid } from '../PodcastEpisodesGrid'

const animatedListSpy = vi.fn()
const shellSpy = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ country: 'us' }),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexEpisodes: vi.fn(),
  },
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
  InteractiveArtwork: () => <div />,
}))

vi.mock('../../interactive/InteractiveTitle', () => ({
  InteractiveTitle: ({ title }: { title: string }) => <div>{title}</div>,
}))

describe('PodcastEpisodesGrid', () => {
  it('keeps ROWS=3 grouping parity and passes grid navigation config', () => {
    render(
      <PodcastEpisodesGrid
        episodes={
          [
            { id: 'e1', name: 'Episode 1', artistName: 'A', genres: [], url: 'https://x/id1' },
            { id: 'e2', name: 'Episode 2', artistName: 'A', genres: [], url: 'https://x/id1' },
            { id: 'e3', name: 'Episode 3', artistName: 'A', genres: [], url: 'https://x/id1' },
            { id: 'e4', name: 'Episode 4', artistName: 'A', genres: [], url: 'https://x/id1' },
          ] as never
        }
      />
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
})

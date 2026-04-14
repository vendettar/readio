import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEpisodeCompactKey } from '../../../lib/discovery/editorPicks'
import { PodcastEpisodesGrid } from '../PodcastEpisodesGrid'

const navigateMock = vi.fn()
const getPodcastIndexEpisodesMock = vi.fn()

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
  default: {
    getPodcastIndexEpisodes: (...args: unknown[]) => getPodcastIndexEpisodesMock(...args),
  },
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

describe('PodcastEpisodesGrid URL hygiene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates top episodes to canonical podcastItunesId plus compact key routes after PI enrichment', async () => {
    getPodcastIndexEpisodesMock.mockResolvedValueOnce([
      {
        id: '75f3241b-439d-4786-8968-07e05e548074',
        title: 'Different PI Title',
        description: '',
        audioUrl: 'https://cdn.apple.example.com/audio/top-episode.mp3?signature=pi',
        pubDate: '2024-01-01T00:00:00.000Z',
        episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      },
    ])

    render(
      <PodcastEpisodesGrid
        episodes={
          [
            {
              id: 'episode-1',
              name: 'Top Episode',
              artistName: 'Host',
              artworkUrl100: 'https://example.com/art.jpg',
              url: 'https://podcasts.apple.com/us/podcast/example/id12345?i=episode-1',
              audioUrl: 'https://cdn.apple.example.com/audio/top-episode.mp3?token=apple',
              podcastItunesId: '12345',
              genres: [],
            },
          ] as never
        }
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Top Episode' }))

    await waitFor(() => {
      expect(getPodcastIndexEpisodesMock).toHaveBeenCalledWith('12345', 60, undefined)
    })
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/podcast/$country/$id/$episodeKey',
      params: {
        country: 'us',
        id: '12345',
        episodeKey: buildEpisodeCompactKey('75f3241b-439d-4786-8968-07e05e548074'),
      },
    })
  })

  it('falls back to the show route when PI enrichment fails', async () => {
    getPodcastIndexEpisodesMock.mockRejectedValueOnce(new Error('network down'))

    render(
      <PodcastEpisodesGrid
        episodes={
          [
            {
              id: 'episode-1',
              name: 'Top Episode',
              artistName: 'Host',
              artworkUrl100: 'https://example.com/art.jpg',
              url: 'https://podcasts.apple.com/us/podcast/example/id12345?i=episode-1',
              audioUrl: 'https://cdn.apple.example.com/audio/top-episode.mp3?token=apple',
              podcastItunesId: '12345',
              genres: [],
            },
          ] as never
        }
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'artwork' }))

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

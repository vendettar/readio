import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PodcastShowCard } from '../PodcastShowCard'

const podcastCardPropsSpy = vi.fn()

vi.mock('../../PodcastCard/PodcastCard', () => ({
  PodcastCard: (props: Record<string, unknown>) => {
    podcastCardPropsSpy(props)
    return <div data-testid="podcast-card-probe" />
  },
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
    }),
}))

describe('PodcastShowCard editor pick canonical route', () => {
  it('uses podcastindex podcastItunesId as the show route id and forwards the snapshot', () => {
    podcastCardPropsSpy.mockReset()

    render(
      <PodcastShowCard
        podcast={{
          id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
          title: 'Editor Pick Podcast',
          author: 'Host',
          image: 'https://example.com/show-100.jpg',
          artwork: 'https://example.com/show-100.jpg',
          url: 'https://example.com/show',
          genres: [],
          feedUrl: 'https://example.com/show-feed.xml',
          feedId: '4063627',
          podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
          podcastItunesId: '12345',
        }}
        index={0}
      />
    )

    expect(podcastCardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/podcast/$country/$id',
        params: {
          country: 'us',
          id: '12345',
        },
        state: expect.objectContaining({
          editorPickSnapshot: expect.objectContaining({
            id: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
            podcastItunesId: '12345',
            feedId: '4063627',
          }),
        }),
      })
    )
  })

  it('does not generate a show route if podcastItunesId is missing (strictly enforced)', () => {
    podcastCardPropsSpy.mockReset()

    render(
      <PodcastShowCard
        podcast={{
          id: 'guid-no-itunes',
          title: 'Non-itunes Podcast',
          author: 'Host',
          image: 'https://example.com/show-100.jpg',
          artwork: 'https://example.com/show-100.jpg',
          url: 'https://example.com/show',
          genres: [],
          feedUrl: 'https://example.com/show-feed.xml',
          feedId: '4063627',
          podcastGuid: 'guid-no-itunes',
          // podcastItunesId missing
        }}
        index={1}
      />
    )

    expect(podcastCardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Non-itunes Podcast',
        // Should have no link properties
        to: undefined,
        params: undefined,
      })
    )
  })
})

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import type { EditorPickPodcast } from '../../../lib/discovery'
import { EditorPickShowCard } from '../EditorPickShowCard'

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

describe('EditorPickShowCard routing', () => {
  it('uses podcastindex podcastItunesId as the show route id and forwards the snapshot', () => {
    podcastCardPropsSpy.mockReset()

    const podcast: EditorPickPodcast = {
      title: 'Editor Pick Podcast',
      author: 'Host',
      artwork: 'https://example.com/show-100.jpg',
      description: 'A podcast',
      feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
      lastUpdateTime: 1613394044,
      podcastItunesId: '12345',
      episodeCount: 50,
      language: 'en',
      genres: ['News'],
    }

    render(<EditorPickShowCard podcast={podcast} index={0} />)

    expect(podcastCardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/podcast/$country/$id',
        params: {
          country: 'us',
          id: '12345',
        },
        state: expect.objectContaining({
          editorPickSnapshot: expect.objectContaining({
            podcastItunesId: '12345',
          }),
        }),
      })
    )
  })

  it('does not generate a show route if podcastItunesId is missing (strictly enforced)', () => {
    podcastCardPropsSpy.mockReset()

    const invalidPodcast: EditorPickPodcast = {
      title: 'Non-itunes Podcast',
      author: 'Host',
      artwork: 'https://example.com/show-100.jpg',
      description: 'A podcast',
      feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
      lastUpdateTime: 1613394044,
      podcastItunesId: '', // Invalid/Empty to trigger missing route check
      episodeCount: 50,
      language: 'en',
      genres: ['News'],
    }

    render(<EditorPickShowCard podcast={invalidPodcast} index={1} />)

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

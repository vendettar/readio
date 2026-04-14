import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastShowPage from '../PodcastShowPage'

const subscribeMock = vi.fn()
const unsubscribeMock = vi.fn()
const playEpisodeMock = vi.fn()

const podcast = {
  podcastItunesId: 'pod-1',
  feedUrl: 'https://example.com/feed.xml',
  collectionName: 'Podcast Show',
  artistName: 'Host',
  artworkUrl600: 'https://example.com/art-600.jpg',
  artworkUrl100: 'https://example.com/art-100.jpg',
  primaryGenreName: 'News',
}

const feed = {
  description: 'desc',
  episodes: [
    {
      id: 'ep-1',
      title: 'Episode 1',
      audioUrl: 'https://example.com/ep-1.mp3',
      pubDate: '2024-01-01T00:00:00.000Z',
      description: 'Episode 1 description',
    },
  ],
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useParams: () => ({ country: 'us', id: 'pod-1' }),
  useLocation: () => ({ state: null }),
}))

let queryCall = 0
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => {
    queryCall += 1
    if (queryCall === 1) {
      return { data: podcast, isLoading: false, error: null }
    }
    return { data: feed, isLoading: false, error: null }
  },
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: playEpisodeMock,
  }),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      subscriptions: [],
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      country: 'us',
      isFavorited: () => false,
    }),
}))

vi.mock('../../../lib/discovery', () => ({
  default: {
    getPodcastIndexPodcastByItunesId: vi.fn(),
    fetchPodcastFeed: vi.fn(),
    getPodcastIndexEpisodes: vi.fn(),
  },
}))

describe('PodcastShowPage action wiring', () => {
  beforeEach(() => {
    queryCall = 0
    subscribeMock.mockReset()
    unsubscribeMock.mockReset()
    playEpisodeMock.mockReset()
  })

  it('keeps subscribe action semantics after extraction', async () => {
    subscribeMock.mockResolvedValue(undefined)
    render(<PodcastShowPage />)

    const subscribeBtn = screen.getByLabelText('subscribe')
    fireEvent.click(subscribeBtn)

    expect(subscribeMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeMock).not.toHaveBeenCalled()
  })
})

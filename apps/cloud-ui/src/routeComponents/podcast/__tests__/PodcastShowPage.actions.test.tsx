import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeFeedEpisode,
  makeParsedFeed,
  makePodcast,
} from '../../../lib/discovery/__tests__/fixtures'
import PodcastShowPage from '../PodcastShowPage'

const subscribeMock = vi.fn()
const unsubscribeMock = vi.fn()
const playEpisodeMock = vi.fn()

const podcast = makePodcast({
  podcastItunesId: 'pod-1',
  feedUrl: 'https://example.com/feed.xml',
  title: 'Podcast Show',
  genres: ['News'],
})

const feed = makeParsedFeed({
  description: 'desc',
  episodes: [
    makeFeedEpisode({
      episodeGuid: 'ep-1',
      title: 'Episode 1',
      audioUrl: 'https://example.com/ep-1.mp3',
      pubDate: '2024-01-01T00:00:00.000Z',
      description: 'Episode 1 description',
    }),
  ],
})

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
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
  }),
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

vi.mock('../../../lib/discovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/discovery')>()
  return {
    ...actual,
    default: {
      getPodcastIndexPodcastByItunesId: vi.fn(),
      fetchPodcastFeed: vi.fn(),
    },
  }
})

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

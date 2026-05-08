import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeEpisode,
  makePodcast,
  makePodcastEpisodes,
} from '../../../lib/discovery/__tests__/fixtures'
import PodcastShowPage from '../PodcastShowPage'

const subscribeMock = vi.fn()
const unsubscribeMock = vi.fn()
const playEpisodeMock = vi.fn()
let routeCountry = 'us'

const podcast = makePodcast({
  podcastItunesId: 'pod-1',
  title: 'Podcast Show',
  genres: ['News'],
})

const episodeList = makePodcastEpisodes({
  episodes: [
    makeEpisode({
      guid: 'ep-1',
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
  useParams: () => ({ country: routeCountry, id: 'pod-1' }),
  useLocation: () => ({ state: null }),
}))

let queryCall = 0
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => {
    queryCall += 1
    if (queryCall === 1) {
      return { data: podcast, isLoading: false, error: null }
    }
    return { data: episodeList, isLoading: false, error: null }
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
      fetchPodcastEpisodes: vi.fn(),
    },
  }
})

describe('PodcastShowPage action wiring', () => {
  beforeEach(() => {
    queryCall = 0
    routeCountry = 'us'
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

  it('does not render latest-episode play action when route country is invalid', async () => {
    routeCountry = 'invalid'
    render(<PodcastShowPage />)

    expect(screen.queryByText('latestEpisode')).toBeNull()
    expect(playEpisodeMock).not.toHaveBeenCalled()
  })
})

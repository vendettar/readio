import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DISCOVERY_TEST_ROUTE, discoveryUrl } from '../../../__tests__/constants'
import { createQueryClientWrapper } from '../../../__tests__/queryClient'
import { server } from '../../../__tests__/setup'
import {
  makeEpisode,
  makePodcast,
  makePodcastEpisodes,
} from '../../../lib/discovery/__tests__/fixtures'
import PodcastShowPage from '../PodcastShowPage'

let appleLookupHits = 0
let directLegacyFeedHits = 0

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useLocation: () => ({ state: null }),
  useParams: () => ({ country: 'us', id: '123' }),
}))

vi.mock('../../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playEpisode: vi.fn(),
  }),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
      subscriptions: [],
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      isFavorited: () => false,
    }),
}))

describe('PodcastShowPage 005c same-origin PI episodes cutover', () => {
  beforeEach(() => {
    appleLookupHits = 0
    directLegacyFeedHits = 0
    server.use(
      http.get('https://itunes.apple.com/lookup', () => {
        appleLookupHits += 1
        return HttpResponse.json({ resultCount: 0, results: [] })
      }),
      http.get('https://example.com/feed.xml', () => {
        directLegacyFeedHits += 1
        return new HttpResponse('unexpected legacy feed call', { status: 500 })
      }),
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastByItunesId('123')), () => {
        return HttpResponse.json(
          makePodcast({
            podcastItunesId: '123',
            title: 'Cloud Episode Podcast',
            description: 'Cloud PI show description',
            episodeCount: 2,
          })
        )
      }),
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastEpisodesByItunesId('123')), () => {
        return HttpResponse.json(
          makePodcastEpisodes({
            episodes: [
              makeEpisode({
                guid: 'ep-1',
                title: 'Episode 1',
                description: 'Episode description',
                audioUrl: 'https://example.com/audio-1.mp3',
                artworkUrl: 'https://example.com/ep-1.jpg',
              }),
            ],
          })
        )
      })
    )
  })

  it('renders through same-origin lookup and PI episode endpoints without direct Apple or legacy feed calls', async () => {
    render(<PodcastShowPage />, { wrapper: createQueryClientWrapper() })

    expect(await screen.findByText('Cloud Episode Podcast')).not.toBeNull()
    expect(await screen.findByText('Episode 1')).not.toBeNull()
    expect(await screen.findByText('Cloud PI show description')).not.toBeNull()
    expect(appleLookupHits).toBe(0)
    expect(directLegacyFeedHits).toBe(0)
  })
})

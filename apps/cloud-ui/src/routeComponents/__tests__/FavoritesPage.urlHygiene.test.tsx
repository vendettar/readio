import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import FavoritesPage from '../FavoritesPage'

const buildPodcastEpisodeRouteMock = vi.fn((_args?: unknown) => ({
  to: '/$country/podcast/$id/episode/$episodeId' as const,
  params: { country: 'us', id: '123', episodeId: 'episode-title-abcd1234' },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      favoritesLoaded: true,
      removeFavorite: vi.fn(),
      favorites: [
        {
          id: 'fav-1',
          key: 'feed::audio',
          feedUrl: 'feed',
          audioUrl: 'audio',
          providerEpisodeId: 'ep-provider-1',
          providerPodcastId: '123',
          episodeId: 'episode-id-1',
          episodeTitle: 'Episode Title',
          podcastTitle: 'Podcast',
          pubDate: '2024-01-01',
          duration: 30,
          artworkUrl: '',
          countryAtSave: 'us',
        },
      ],
    }),
}))

vi.mock('../../hooks/useSubscriptionMap', () => ({
  useSubscriptionMap: () => new Map<string, string>(),
}))

vi.mock('../../hooks/useEpisodePlayback', () => ({
  useEpisodePlayback: () => ({
    playFavorite: vi.fn(),
  }),
}))

vi.mock('../../lib/routes/podcastRoutes', () => ({
  normalizeCountryParam: (country: string) => country,
  buildPodcastEpisodeRoute: (args: unknown) => buildPodcastEpisodeRouteMock(args),
}))

vi.mock('../../components/EpisodeRow', () => ({
  EpisodeListItem: () => <div data-testid="episode-row" />,
  fromFavorite: ({
    favorite,
    subscriptionMap,
  }: {
    favorite: {
      episodeTitle: string
      countryAtSave?: string
      providerPodcastId?: string
      feedUrl: string
      episodeId?: string
    }
    subscriptionMap: Map<string, string>
  }) => {
    buildPodcastEpisodeRouteMock({
      country: favorite.countryAtSave,
      podcastId: favorite.providerPodcastId || subscriptionMap.get(favorite.feedUrl),
      episodeSlug: favorite.episodeTitle,
    })
    return {
      title: favorite.episodeTitle,
      route: null,
      playAriaLabel: 'btnPlayOnly',
    }
  },
}))

vi.mock('../../components/interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: () => null,
}))

vi.mock('../../components/interactive/InteractiveTitle', () => ({
  InteractiveTitle: () => null,
}))

vi.mock('../../components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}))

vi.mock('../../components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../components/ui/empty-state', () => ({
  EmptyState: () => null,
}))

vi.mock('../../components/ui/loading-spinner', () => ({
  LoadingPage: () => null,
}))

vi.mock('../../components/ui/overflow-menu', () => ({
  OverflowMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../lib/dateUtils', () => ({
  formatDateStandard: () => 'date',
  formatDuration: () => 'duration',
  formatRelativeTime: () => 'now',
}))

vi.mock('../../lib/htmlUtils', () => ({
  stripHtml: (text: string) => text,
}))

describe('FavoritesPage URL hygiene', () => {
  it('builds canonical episode route without query-hint search params', () => {
    render(<FavoritesPage />)

    expect(buildPodcastEpisodeRouteMock).toHaveBeenCalledTimes(1)
    const firstCall = buildPodcastEpisodeRouteMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const args = (firstCall?.[0] ?? {}) as Record<string, unknown>
    expect(args).toMatchObject({
      country: 'us',
      podcastId: '123',
    })
    expect(args).not.toHaveProperty('search')
  })
})

import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchEpisodeItem } from '../SearchEpisodeItem'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../SearchResultItem', () => ({}))

vi.mock('../../EpisodeRow', () => ({
  EpisodeListItem: ({
    model,
    onPlay,
  }: {
    model: {
      title: string
      route?: { to?: string; search?: unknown; params?: unknown } | null
      playAriaLabel: string
    }
    onPlay: () => void
  }) => (
    <div>
      <button type="button">{model.title}</button>
      <span data-testid="route-to">{model.route?.to ?? ''}</span>
      <span data-testid="route-params">{JSON.stringify(model.route?.params ?? {})}</span>
      <span data-testid="route-search">{String(model.route?.search)}</span>
      <button type="button" aria-label={model.playAriaLabel} onClick={onPlay} />
    </div>
  ),
}))

vi.mock('../../ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../ui/overflow-menu', () => ({
  OverflowMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      favorites: [],
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      country: 'us',
    }),
}))

vi.mock('../../../lib/dateUtils', () => ({
  formatDuration: () => '1:00',
  formatRelativeTime: () => '1d',
}))

vi.mock('../../../lib/discovery', () => ({
  default: { getPodcastIndexPodcastByItunesId: vi.fn() },
}))

vi.mock('../../../lib/htmlUtils', () => ({
  stripHtml: (value: string) => value,
}))

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../../lib/toast', () => ({
  toast: { errorKey: vi.fn() },
}))

describe('SearchEpisodeItem URL hygiene', () => {
  it('builds canonical episode links without query hints', () => {
    render(
      <SearchEpisodeItem
        episode={{
          id: 'episode-id-42',
          providerEpisodeId: '42',
          podcastItunesId: '7',
          episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
          title: 'Episode Name',
          podcastTitle: 'Show Name',
          author: 'Host',
          episodeUrl: 'https://example.com/audio.mp3',
          releaseDate: '2025-01-01T00:00:00Z',
          description: 'desc',
          image: 'https://example.com/artwork-100.jpg',
          artwork: 'https://example.com/artwork-600.jpg',
        }}
        onPlay={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Episode Name' })).toBeTruthy()

    expect(screen.getByTestId('route-to').textContent).toBe('/podcast/$country/$id/$episodeKey')
    const routeParamsText = screen.getByTestId('route-params').textContent ?? '{}'
    const routeParams = JSON.parse(routeParamsText) as {
      country?: string
      id?: string
      episodeKey?: string
    }
    expect(routeParams.country).toBe('us')
    expect(routeParams.id).toBe('7')
    expect(routeParams.episodeKey).toBe('dfMkG0OdR4aJaAfgXlSAdA')
    expect(screen.getByTestId('route-search').textContent).toBe('undefined')
  })

  it('uses play semantics for non-artwork play affordance', () => {
    const onPlay = vi.fn()

    render(
      <SearchEpisodeItem
        episode={{
          id: 'episode-id-43',
          providerEpisodeId: '43',
          podcastItunesId: '7',
          episodeGuid: 'episode-guid-43',
          title: 'Episode Without Artwork',
          podcastTitle: 'Show Name',
          author: 'Host',
          episodeUrl: 'https://example.com/audio-2.mp3',
          releaseDate: '2025-01-01T00:00:00Z',
          description: 'desc',
          image: '',
          artwork: '',
        }}
        onPlay={onPlay}
      />
    )

    screen.getByRole('button', { name: 'ariaPlayEpisode' }).click()
    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})

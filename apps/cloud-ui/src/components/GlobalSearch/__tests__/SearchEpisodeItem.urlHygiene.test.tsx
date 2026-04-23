import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchEpisodeItem } from '../SearchEpisodeItem'

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}))

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
  default: {
    getPodcastIndexPodcastByItunesId: vi.fn(),
  },
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
  it('does not build a direct episode route from first-hop search payload alone', () => {
    render(
      <SearchEpisodeItem
        episode={{
          podcastItunesId: '7',
          title: 'Episode Name',
          showTitle: 'Show Name',
          episodeUrl: 'https://example.com/audio.mp3',
          episodeGuid: 'guid-1',
          releaseDate: '2025-01-01T00:00:00Z',
          trackTimeMillis: 61000,
          shortDescription: 'desc',
          artwork: 'https://example.com/artwork-600.jpg',
        }}
        onPlay={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Episode Name' })).toBeTruthy()

    expect(screen.getByTestId('route-to').textContent).toBe('')
    const routeParamsText = screen.getByTestId('route-params').textContent ?? '{}'
    expect(routeParamsText).toBe('{}')
    expect(screen.getByTestId('route-search').textContent).toBe('undefined')
  })

  it('returns null route for first-hop search payload alone', () => {
    render(
      <SearchEpisodeItem
        episode={{
          podcastItunesId: '7',
          title: 'Episode Without GUID',
          showTitle: 'Show Name',
          episodeUrl: 'https://example.com/audio2.mp3',
          episodeGuid: 'guid-2',
          releaseDate: '2025-01-02T00:00:00Z',
          trackTimeMillis: 62000,
          shortDescription: 'desc',
          artwork: 'https://example.com/artwork-600.jpg',
        }}
        onPlay={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Episode Without GUID' })).toBeTruthy()

    expect(screen.getByTestId('route-to').textContent).toBe('')
    const routeParamsText = screen.getByTestId('route-params').textContent ?? '{}'
    expect(routeParamsText).toBe('{}')
  })

  it('uses play semantics for non-artwork play affordance', () => {
    const onPlay = vi.fn()

    render(
      <SearchEpisodeItem
        episode={{
          podcastItunesId: '7',
          title: 'Episode Without Artwork',
          showTitle: 'Show Name',
          episodeUrl: 'https://example.com/audio-2.mp3',
          episodeGuid: 'guid-3',
          releaseDate: '2025-01-01T00:00:00Z',
          trackTimeMillis: 63000,
          shortDescription: 'desc',
          artwork: 'https://example.com/artwork-600.jpg',
        }}
        onPlay={onPlay}
      />
    )

    screen.getByRole('button', { name: 'ariaPlayEpisode' }).click()
    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})

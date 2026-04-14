import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EpisodeListItem } from '../EpisodeListItem'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../../interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: ({ onPlay }: { onPlay: () => void }) => (
    <button type="button" aria-label="artwork-play" onClick={onPlay}>
      artwork
    </button>
  ),
}))

vi.mock('../../interactive/InteractiveTitle', () => ({
  InteractiveTitle: ({
    title,
    onClick,
  }: {
    title: string
    onClick?: () => void
    children?: ReactNode
  }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}))

describe('EpisodeListItem', () => {
  it('shows gutter fallback when no artwork is present', () => {
    const onPlay = vi.fn()
    render(
      <EpisodeListItem
        model={{
          title: 'No Artwork Episode',
          route: null,
          playAriaLabel: 'ariaPlayEpisode',
        }}
        onPlay={onPlay}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'ariaPlayEpisode' }))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'artwork-play' })).toBeNull()
  })

  it('does not fall back to onPlay when title has a route', () => {
    const onPlay = vi.fn()
    render(
      <EpisodeListItem
        model={{
          title: 'Routed Episode',
          route: {
            to: '/podcast/$country/$id/$episodeKey',
            params: {
              country: 'us',
              id: 'podcast-1',
              episodeKey: 'QWxsIHlvdXIgaGFzIG91cg',
            },
          },
          playAriaLabel: 'ariaPlayEpisode',
        }}
        onPlay={onPlay}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Routed Episode' }))
    expect(onPlay).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'ariaPlayEpisode' }))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('does not fall back to onPlay when title has no route', () => {
    const onPlay = vi.fn()
    render(
      <EpisodeListItem
        model={{
          title: 'Unrouted Episode',
          route: null,
          playAriaLabel: 'ariaPlayEpisode',
        }}
        onPlay={onPlay}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unrouted Episode' }))
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('renders subtitle/meta and favorite reveal classes', () => {
    const onToggle = vi.fn()
    render(
      <EpisodeListItem
        model={{
          title: 'Episode',
          subtitle: 'SUB',
          meta: 'META',
          description: 'DESC',
          route: null,
          playAriaLabel: 'ariaPlayEpisode',
        }}
        onPlay={vi.fn()}
        favorite={{
          enabled: true,
          favorited: false,
          onToggle,
        }}
      />
    )

    expect(screen.getByText('SUB')).toBeTruthy()
    expect(screen.getByText('META')).toBeTruthy()
    expect(screen.getByText('DESC')).toBeTruthy()

    const favoriteButton = screen.getByRole('button', { name: 'ariaAddFavorite' })
    expect(favoriteButton.className).toContain('group-hover/episode:opacity-100')
    fireEvent.click(favoriteButton)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

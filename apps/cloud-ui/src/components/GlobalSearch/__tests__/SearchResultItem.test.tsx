import { fireEvent, render, screen } from '@testing-library/react'
import { ChevronRight } from 'lucide-react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchResultItem } from '../SearchResultItem'

vi.mock('../../interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: ({
    onClick,
    onPlay,
    playLabel,
  }: {
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
    onPlay?: (e: React.MouseEvent<HTMLButtonElement>) => void
    playLabel?: string
  }) => (
    <div>
      <button type="button" aria-label="artwork" onClick={onClick}>
        artwork
      </button>
      {onPlay && (
        <button type="button" aria-label={playLabel ?? 'play'} onClick={onPlay}>
          play
        </button>
      )}
    </div>
  ),
}))

vi.mock('../../interactive/InteractiveTitle', () => ({
  InteractiveTitle: ({
    title,
    onClick,
  }: {
    title: string
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}))

describe('SearchResultItem', () => {
  it('keeps title click bound to onClick and preserves subtitle content and right icon', () => {
    const onClick = vi.fn()

    render(
      <SearchResultItem
        title="Episode title"
        subtitle="Subtitle text"
        extraSubtitle="New"
        onClick={onClick}
        rightIcon={ChevronRight}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Episode title' }))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Subtitle text')).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()
    expect(document.querySelector('svg')).toBeTruthy()
  })

  it('routes play overlay clicks to onArtworkClick when provided', () => {
    const onClick = vi.fn()
    const onArtworkClick = vi.fn()

    render(
      <SearchResultItem
        title="Playable episode"
        onClick={onClick}
        onArtworkClick={onArtworkClick}
        artworkAriaLabel="Play episode"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play episode' }))

    expect(onArtworkClick).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps artwork area bound to onClick when no onArtworkClick is provided', () => {
    const onClick = vi.fn()

    render(<SearchResultItem title="Static artwork" onClick={onClick} />)

    fireEvent.click(screen.getByRole('button', { name: 'artwork' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

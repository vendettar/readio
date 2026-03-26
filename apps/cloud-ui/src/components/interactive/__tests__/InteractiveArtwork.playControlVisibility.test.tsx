import { render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InteractiveArtwork } from '../InteractiveArtwork'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('framer-motion', () => ({
  motion: {
    img: ({
      layoutId: _layoutId,
      ...props
    }: ImgHTMLAttributes<HTMLImageElement> & { layoutId?: string }) => <img alt="" {...props} />,
  },
}))

describe('InteractiveArtwork playControlVisibility', () => {
  it('keeps overlay hover-only by default in center mode', () => {
    render(
      <InteractiveArtwork src="https://example.com/cover.jpg" onPlay={vi.fn()} playLabel="Play" />
    )

    const playButton = screen.getByRole('button', { name: 'Play' })
    const overlay = playButton.parentElement as HTMLElement

    expect(overlay.className).toContain('opacity-0')
    expect(overlay.className).not.toContain('[@media(hover:none)]:opacity-100')
    expect(overlay.className).not.toContain('[@media(pointer:coarse)]:opacity-100')
  })

  it('shows center-mode play affordance for touch input when hover-or-touch is enabled', () => {
    render(
      <InteractiveArtwork
        src="https://example.com/cover.jpg"
        onPlay={vi.fn()}
        playLabel="Play"
        playControlVisibility="hover-or-touch"
      />
    )

    const playButton = screen.getByRole('button', { name: 'Play' })
    const overlay = playButton.parentElement as HTMLElement

    expect(overlay.className).toContain('[@media(hover:none)]:opacity-100')
    expect(overlay.className).toContain('[@media(pointer:coarse)]:opacity-100')
  })

  it('shows corner-mode play affordance for touch input when hover-or-touch is enabled', () => {
    render(
      <InteractiveArtwork
        src="https://example.com/cover.jpg"
        onPlay={vi.fn()}
        playLabel="Play"
        playPosition="bottom-start"
        playControlVisibility="hover-or-touch"
      />
    )

    const playButton = screen.getByRole('button', { name: 'Play' })

    expect(playButton.className).toContain('[@media(hover:none)]:translate-y-0')
    expect(playButton.className).toContain('[@media(hover:none)]:opacity-100')
    expect(playButton.className).toContain('[@media(pointer:coarse)]:translate-y-0')
    expect(playButton.className).toContain('[@media(pointer:coarse)]:opacity-100')
  })
})

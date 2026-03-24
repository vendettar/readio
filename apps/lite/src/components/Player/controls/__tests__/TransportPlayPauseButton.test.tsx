import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TransportPlayPauseButton } from '../TransportPlayPauseButton'

describe('TransportPlayPauseButton', () => {
  it('renders loading/play/pause states with aria labels', () => {
    const noop = vi.fn()
    const { rerender } = render(
      <TransportPlayPauseButton isPlaying={false} isLoading onToggle={noop} ariaLabel="ariaPlay" />
    )
    expect(document.querySelector('.animate-spin')).toBeTruthy()

    rerender(
      <TransportPlayPauseButton
        isPlaying={false}
        isLoading={false}
        onToggle={noop}
        ariaLabel="ariaPlay"
      />
    )
    expect(screen.getByLabelText('ariaPlay')).toBeTruthy()

    rerender(
      <TransportPlayPauseButton isPlaying isLoading={false} onToggle={noop} ariaLabel="ariaPause" />
    )
    expect(screen.getByLabelText('ariaPause')).toBeTruthy()
  })

  it('calls toggle callback on click', () => {
    const onToggle = vi.fn()
    render(
      <TransportPlayPauseButton
        isPlaying={false}
        isLoading={false}
        onToggle={onToggle}
        ariaLabel="ariaPlay"
      />
    )

    fireEvent.click(screen.getByLabelText('ariaPlay'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('applies ghost variant when requested', () => {
    render(
      <TransportPlayPauseButton
        variant="ghost"
        isPlaying={false}
        isLoading={false}
        onToggle={vi.fn()}
        ariaLabel="ariaPlay"
      />
    )

    expect(screen.getByLabelText('ariaPlay').className).not.toContain('bg-primary')
  })
})

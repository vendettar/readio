import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlaybackSpeedButton } from '../PlaybackSpeedButton'

describe('PlaybackSpeedButton', () => {
  it('renders normalized playback rate labels', () => {
    const noop = vi.fn()
    const { rerender } = render(
      <PlaybackSpeedButton playbackRate={1} onCycleRate={noop} ariaLabel="ariaPlaybackSpeed" />
    )
    expect(screen.getByLabelText('ariaPlaybackSpeed').textContent).toBe('1x')

    rerender(
      <PlaybackSpeedButton playbackRate={1.25} onCycleRate={noop} ariaLabel="ariaPlaybackSpeed" />
    )
    expect(screen.getByLabelText('ariaPlaybackSpeed').textContent).toBe('1.25x')
  })

  it('dispatches cycle callback on click', () => {
    const onCycleRate = vi.fn()
    render(
      <PlaybackSpeedButton
        playbackRate={1}
        onCycleRate={onCycleRate}
        ariaLabel="ariaPlaybackSpeed"
      />
    )

    fireEvent.click(screen.getByLabelText('ariaPlaybackSpeed'))
    expect(onCycleRate).toHaveBeenCalledTimes(1)
  })
})

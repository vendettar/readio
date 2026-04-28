import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAudioElementSync } from '../useAudioElementSync'

interface HarnessProps {
  audioUrl: string | null
  volume: number
  playbackRate: number
}

function Harness({ audioUrl, volume, playbackRate }: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  useAudioElementSync({ audioRef, audioUrl, volume, playbackRate })
  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="audio-sync-target" />
}

describe('useAudioElementSync', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('syncs src, volume, and playbackRate', () => {
    const { getByTestId, rerender } = render(
      <Harness audioUrl="https://example.com/a.mp3" volume={0.5} playbackRate={1.25} />
    )
    const audio = getByTestId('audio-sync-target') as HTMLAudioElement

    expect(audio.getAttribute('src')).toBe('https://example.com/a.mp3')
    expect(audio.volume).toBe(0.5)
    expect(audio.playbackRate).toBe(1.25)

    rerender(<Harness audioUrl="https://example.com/b.mp3" volume={0.8} playbackRate={1.5} />)
    expect(audio.getAttribute('src')).toBe('https://example.com/b.mp3')
    expect(audio.volume).toBe(0.8)
    expect(audio.playbackRate).toBe(1.5)
  })

  it('clears src and calls load when audioUrl becomes null', () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const { getByTestId, rerender } = render(
      <Harness audioUrl="https://example.com/a.mp3" volume={1} playbackRate={1} />
    )
    const audio = getByTestId('audio-sync-target') as HTMLAudioElement
    expect(audio.getAttribute('src')).toBe('https://example.com/a.mp3')

    rerender(<Harness audioUrl={null} volume={1} playbackRate={1} />)
    expect(audio.getAttribute('src')).toBeNull()
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })
})

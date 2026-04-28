import { act, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useForegroundAudioPrefetch } from '../useForegroundAudioPrefetch'

const { resetForSourceMock, teardownMock, maybePrefetchMock } = vi.hoisted(() => ({
  resetForSourceMock: vi.fn(),
  teardownMock: vi.fn(),
  maybePrefetchMock: vi.fn(),
}))

vi.mock('../../lib/audioPrefetch', () => {
  class AudioPrefetchScheduler {
    resetForSource = resetForSourceMock
    teardown = teardownMock
    maybePrefetch = maybePrefetchMock
  }

  return { AudioPrefetchScheduler }
})

interface HarnessProps {
  audioUrl: string | null
  playbackSourceUrl: string | null
}

function Harness({ audioUrl, playbackSourceUrl }: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  useForegroundAudioPrefetch({ audioRef, audioUrl, playbackSourceUrl })
  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="audio-prefetch-target" />
}

describe('useForegroundAudioPrefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resets scheduler on source switch and tears down when source is cleared', async () => {
    const { rerender } = render(
      <Harness audioUrl="https://example.com/a.mp3" playbackSourceUrl="https://example.com/a.mp3" />
    )
    await act(async () => {
      await Promise.resolve()
    })

    expect(resetForSourceMock).toHaveBeenCalledWith('https://example.com/a.mp3')

    rerender(
      <Harness audioUrl="https://example.com/b.mp3" playbackSourceUrl="https://example.com/b.mp3" />
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(resetForSourceMock).toHaveBeenCalledWith('https://example.com/b.mp3')

    rerender(<Harness audioUrl={null} playbackSourceUrl={null} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(teardownMock).toHaveBeenCalledTimes(1)
  })

  it('tears down scheduler on unmount', () => {
    const { unmount } = render(
      <Harness audioUrl="https://example.com/a.mp3" playbackSourceUrl="https://example.com/a.mp3" />
    )

    unmount()

    expect(teardownMock.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('prefetches against the active playback source instead of the canonical audioUrl', async () => {
    const { getByTestId } = render(
      <Harness
        audioUrl="https://example.com/direct.mp3"
        playbackSourceUrl="https://app.local/api/proxy?url=https%3A%2F%2Fexample.com%2Fdirect.mp3"
      />
    )
    const audio = getByTestId('audio-prefetch-target') as HTMLAudioElement
    await act(async () => {
      await Promise.resolve()
    })

    Object.defineProperty(audio, 'currentSrc', {
      configurable: true,
      get: () => 'https://app.local/api/proxy?url=https%3A%2F%2Fexample.com%2Fdirect.mp3',
    })

    await act(async () => {
      fireEvent.timeUpdate(audio)
    })

    expect(maybePrefetchMock).toHaveBeenCalledWith({
      sourceId: 'https://example.com/direct.mp3',
      sourceUrl: 'https://app.local/api/proxy?url=https%3A%2F%2Fexample.com%2Fdirect.mp3',
      audio,
    })
  })
})

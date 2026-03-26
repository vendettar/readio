import { render } from '@testing-library/react'
import { useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useForegroundAudioPrefetch } from '../useForegroundAudioPrefetch'

const schedulerInstances: Array<{
  resetForSource: ReturnType<typeof vi.fn>
  teardown: ReturnType<typeof vi.fn>
  maybePrefetch: ReturnType<typeof vi.fn>
}> = []

vi.mock('../../lib/audioPrefetch', () => {
  class AudioPrefetchScheduler {
    resetForSource = vi.fn()
    teardown = vi.fn()
    maybePrefetch = vi.fn()

    constructor() {
      schedulerInstances.push(this)
    }
  }

  return { AudioPrefetchScheduler }
})

vi.mock('../useEventListener', () => ({
  useEventListener: vi.fn(),
}))

interface HarnessProps {
  audioUrl: string | null
}

function Harness({ audioUrl }: HarnessProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  useForegroundAudioPrefetch({ audioRef, audioUrl })
  // biome-ignore lint/a11y/useMediaCaption: test-only audio element
  return <audio ref={audioRef} data-testid="audio-prefetch-target" />
}

describe('useForegroundAudioPrefetch', () => {
  beforeEach(() => {
    schedulerInstances.length = 0
    vi.clearAllMocks()
  })

  it('resets scheduler on source switch and tears down when source is cleared', () => {
    const { rerender } = render(<Harness audioUrl="https://example.com/a.mp3" />)

    const scheduler = schedulerInstances[0]
    expect(scheduler).toBeTruthy()
    expect(scheduler.resetForSource).toHaveBeenCalledWith('https://example.com/a.mp3')

    rerender(<Harness audioUrl="https://example.com/b.mp3" />)
    expect(scheduler.resetForSource).toHaveBeenCalledWith('https://example.com/b.mp3')

    rerender(<Harness audioUrl={null} />)
    expect(scheduler.teardown).toHaveBeenCalledTimes(1)
  })

  it('tears down scheduler on unmount', () => {
    const { unmount } = render(<Harness audioUrl="https://example.com/a.mp3" />)
    const scheduler = schedulerInstances[0]

    unmount()

    expect(scheduler.teardown).toHaveBeenCalledTimes(1)
  })
})

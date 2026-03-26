// src/components/AppShell/__tests__/GlobalAudioController.session-race.regression.test.tsx
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import { GlobalAudioController } from '../GlobalAudioController'

// Mock dependencies
vi.mock('../../../hooks/useImageObjectUrl', () => ({ useImageObjectUrl: () => null }))
vi.mock('../../../hooks/useMediaSession', () => ({ useMediaSession: vi.fn() }))
vi.mock('../../../hooks/usePageVisibility', () => ({ usePageVisibility: () => true }))
vi.mock('../../../hooks/usePlayerController', () => ({
  usePlayerController: () => ({
    prevSmart: vi.fn(),
    nextSmart: vi.fn(),
  }),
}))
vi.mock('../../../hooks/useTabSync', () => ({ useTabSync: vi.fn() }))

// We need restoreProgress to be a stable mock so we can track calls
const restoreProgressMock = vi.fn()

vi.mock('../../../hooks/useSession', () => ({
  useSession: () => ({
    restoreProgress: restoreProgressMock,
  }),
}))

describe('GlobalAudioController Regression: Session Race', () => {
  beforeEach(() => {
    act(() => {
      usePlayerStore.getState().reset()
    })
    vi.clearAllMocks()

    // Mock audio element properties
    if (typeof HTMLMediaElement !== 'undefined') {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    }
  })

  it('triggers a second-chance restoreProgress when sessionId becomes available after metadata', async () => {
    // 1. Initial render with no session
    const { container, rerender } = render(<GlobalAudioController />)
    const audio = container.querySelector('audio') as HTMLAudioElement
    expect(audio).toBeTruthy()

    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/late-binding.mp3', 'Late Binding')
    })

    await act(async () => {
      rerender(<GlobalAudioController />)
    })

    // 2. Simulate metadata loaded (readyState >=1) but NO sessionId yet
    // In actual useAudioElementEvents, this would call restoreProgress which would no-op
    Object.defineProperty(audio, 'readyState', {
      configurable: true,
      get: () => 1, // HAVE_METADATA
    })

    await act(async () => {
      const { fireEvent } = await import('@testing-library/react')
      fireEvent(audio, new Event('loadedmetadata'))
    })

    expect(restoreProgressMock).not.toHaveBeenCalled()

    // 3. Simulate sessionId becoming available (e.g. from findOrStartSession)
    await act(async () => {
      usePlayerStore.setState({ sessionId: 'late-binding-session' })
    })

    // 4. Rerender
    await act(async () => {
      rerender(<GlobalAudioController />)
    })

    // 5. Verify restoreProgress was called
    expect(restoreProgressMock).toHaveBeenCalled()
    expect(restoreProgressMock).toHaveBeenCalledWith(audio)
  })

  it('triggers restoreProgress when metadata becomes available AFTER sessionId', async () => {
    // 1. Initial render - set sessionId first
    act(() => {
      usePlayerStore
        .getState()
        .setAudioUrl('https://example.com/early-session.mp3', 'Early Session')
      usePlayerStore.setState({ sessionId: 'early-session' })
    })

    const { container, rerender } = render(<GlobalAudioController />)
    const audio = container.querySelector('audio') as HTMLAudioElement

    // Metadata NOT ready yet (readyState 0)
    Object.defineProperty(audio, 'readyState', { configurable: true, get: () => 0 })
    rerender(<GlobalAudioController />)

    expect(restoreProgressMock).not.toHaveBeenCalled()

    // 2. Metadata becomes ready
    Object.defineProperty(audio, 'readyState', { configurable: true, get: () => 1 })

    await act(async () => {
      const { fireEvent } = await import('@testing-library/react')
      fireEvent(audio, new Event('loadedmetadata'))
    })

    // 3. Effect should now run because mediaReadyTick changed
    expect(restoreProgressMock).toHaveBeenCalled()
    expect(restoreProgressMock).toHaveBeenCalledWith(audio)
  })
})

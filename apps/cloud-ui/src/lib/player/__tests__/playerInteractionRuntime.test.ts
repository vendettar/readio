import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import {
  handleAutoplayBlocked,
  isPlayerCurrentlyPlaying,
  pausePlayerIfActive,
  resumePlayerIfNeeded,
  shouldContinueAutoplayRetry,
} from '../playerInteractionRuntime'

const { toastInfoKeyMock } = vi.hoisted(() => ({
  toastInfoKeyMock: vi.fn(),
}))

vi.mock('../../toast', () => ({
  toast: {
    infoKey: toastInfoKeyMock,
    errorKey: vi.fn(),
  },
}))

describe('playerInteractionRuntime', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset()
    toastInfoKeyMock.mockReset()
  })

  it('detects and pauses active playback only when needed', () => {
    expect(isPlayerCurrentlyPlaying()).toBe(false)
    expect(pausePlayerIfActive()).toBe(false)

    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    expect(isPlayerCurrentlyPlaying()).toBe(true)
    expect(pausePlayerIfActive()).toBe(true)
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })

  it('resumes playback only when explicitly requested', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().pause()

    resumePlayerIfNeeded(false)
    expect(usePlayerStore.getState().isPlaying).toBe(false)

    resumePlayerIfNeeded(true)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  it('checks whether autoplay retry still belongs to the current playback attempt', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')

    expect(shouldContinueAutoplayRetry('https://example.com/audio.mp3', false)).toBe(true)
    expect(shouldContinueAutoplayRetry('https://example.com/other.mp3', false)).toBe(false)
    expect(shouldContinueAutoplayRetry('https://example.com/audio.mp3', true)).toBe(false)
  })

  it('handles autoplay blocked by pausing and showing the toast', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')

    handleAutoplayBlocked()

    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(toastInfoKeyMock).toHaveBeenCalledWith('player.autoplayBlocked')
  })
})

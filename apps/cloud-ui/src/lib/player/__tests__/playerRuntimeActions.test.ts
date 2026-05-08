import { beforeEach, describe, expect, it } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import {
  beginProxyAudioRecovery,
  finalizePendingSeek,
  handleAudioCanPlay,
  handleAudioTimeUpdate,
  shouldIgnoreAudioPauseWhileRecovering,
  shouldResumeAfterProxyAudioRecovery,
} from '../playerRuntimeActions'

describe('playerRuntimeActions', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset()
  })

  it('promotes loading playback to playing when timeupdate shows active progress', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().play()
    usePlayerStore.getState().setStatus('loading')

    handleAudioTimeUpdate({
      currentTime: 12,
      paused: false,
      ended: false,
    })

    expect(usePlayerStore.getState().progress).toBe(12)
    expect(usePlayerStore.getState().status).toBe('playing')
  })

  it('captures proxy recovery resume intent and updates playback source status', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().play()

    const shouldResume = beginProxyAudioRecovery('/api/proxy?url=test')

    expect(shouldResume).toBe(true)
    expect(usePlayerStore.getState().status).toBe('loading')
    expect(usePlayerStore.getState().playbackSourceUrl).toBe('/api/proxy?url=test')
  })

  it('finalizes pending seek and consumes deferred autoplay', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().pause()
    usePlayerStore.getState().seekTo(25)
    usePlayerStore.getState().queueAutoplayAfterPendingSeek()

    finalizePendingSeek()

    expect(usePlayerStore.getState().pendingSeek).toBeNull()
    expect(usePlayerStore.getState().autoplayAfterPendingSeek).toBe(false)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  it('keeps pause suppression and recovery resume gated by live player intent', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().play()

    expect(shouldIgnoreAudioPauseWhileRecovering(true)).toBe(true)
    expect(shouldResumeAfterProxyAudioRecovery(true)).toBe(true)

    usePlayerStore.getState().pause()

    expect(shouldIgnoreAudioPauseWhileRecovering(true)).toBe(false)
    expect(shouldResumeAfterProxyAudioRecovery(true)).toBe(false)
  })

  it('resolves canplay back to paused when loading while not actively playing', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    usePlayerStore.getState().pause()
    usePlayerStore.getState().setStatus('loading')

    handleAudioCanPlay()

    expect(usePlayerStore.getState().status).toBe('paused')
  })
})

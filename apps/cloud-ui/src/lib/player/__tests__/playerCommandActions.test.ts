import { beforeEach, describe, expect, it } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import { useTranscriptStore } from '../../../store/transcriptStore'
import {
  cyclePlayerPlaybackRate,
  executeJumpToSubtitle,
  executeKeyboardSeekBackward,
  executeKeyboardSeekForward,
  executeMediaSessionSeekBackward,
  executeMediaSessionSeekForward,
  executeMediaSessionSeekTo,
  executeNextSmartSubtitleOrSkip,
  executePreviousSmartSubtitleOrSkip,
  executeSkipBackward,
  executeSkipForward,
  togglePlayerPlayback,
} from '../playerCommandActions'

function resetStores() {
  usePlayerStore.getState().reset()
  useTranscriptStore.getState().resetTranscript()
  usePlayerStore.setState({
    audioLoaded: true,
    duration: 120,
    progress: 50,
    playbackRate: 1,
  })
}

describe('playerCommandActions', () => {
  beforeEach(() => {
    resetStores()
  })

  it('toggles playback through the player store', () => {
    usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Track')
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    togglePlayerPlayback()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
    togglePlayerPlayback()
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  it('executes skip backward and forward with UI semantics', () => {
    usePlayerStore.setState({ progress: 5 })
    executeSkipBackward()
    expect(usePlayerStore.getState().pendingSeek).toBe(0)

    usePlayerStore.setState({ pendingSeek: null, progress: 118, duration: 120 })
    executeSkipForward()
    expect(usePlayerStore.getState().pendingSeek).toBe(120)
  })

  it('prefers subtitle neighbors before falling back to skip actions', () => {
    useTranscriptStore.setState({
      subtitles: [
        { start: 10, end: 20, text: 'a' },
        { start: 30, end: 40, text: 'b' },
        { start: 50, end: 60, text: 'c' },
      ],
      currentIndex: 1,
    })

    executePreviousSmartSubtitleOrSkip()
    expect(usePlayerStore.getState().pendingSeek).toBe(10)

    usePlayerStore.setState({ pendingSeek: null })
    executeNextSmartSubtitleOrSkip()
    expect(usePlayerStore.getState().pendingSeek).toBe(50)

    usePlayerStore.setState({ pendingSeek: null, progress: 20 })
    useTranscriptStore.setState({ subtitles: [], currentIndex: -1 })
    executePreviousSmartSubtitleOrSkip()
    expect(usePlayerStore.getState().pendingSeek).toBe(10)
  })

  it('guards jump-to-subtitle and cycles playback rate', () => {
    useTranscriptStore.setState({
      subtitles: [{ start: 12, end: 20, text: 'a' }],
    })

    executeJumpToSubtitle(0)
    expect(usePlayerStore.getState().pendingSeek).toBe(12)

    usePlayerStore.setState({ pendingSeek: null, playbackRate: 3.7 })
    cyclePlayerPlaybackRate()
    expect(usePlayerStore.getState().playbackRate).toBe(1)
  })

  it('executes media session seek semantics', () => {
    executeMediaSessionSeekBackward()
    expect(usePlayerStore.getState().pendingSeek).toBe(40)

    usePlayerStore.setState({ pendingSeek: null, progress: 100 })
    executeMediaSessionSeekForward()
    expect(usePlayerStore.getState().pendingSeek).toBe(120)

    usePlayerStore.setState({ pendingSeek: null, duration: 120 })
    executeMediaSessionSeekTo(70)
    expect(usePlayerStore.getState().pendingSeek).toBe(70)
  })

  it('executes keyboard seek semantics with 15-second steps', () => {
    usePlayerStore.setState({ progress: 10 })
    executeKeyboardSeekBackward()
    expect(usePlayerStore.getState().pendingSeek).toBe(0)

    usePlayerStore.setState({ pendingSeek: null, progress: 110, duration: 120 })
    executeKeyboardSeekForward()
    expect(usePlayerStore.getState().pendingSeek).toBe(120)

    usePlayerStore.setState({ pendingSeek: null, progress: 10, duration: 0 })
    executeKeyboardSeekForward()
    expect(usePlayerStore.getState().pendingSeek).toBe(25)
  })
})

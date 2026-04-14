import { useCallback } from 'react'
import { usePlayerStore } from '../store/playerStore'
import { useTranscriptStore } from '../store/transcriptStore'

export const SKIP_SECONDS = 10

const PLAYBACK_RATE_CYCLE = [0.8, 1.0, 1.25, 1.5, 2.0] as const

export function usePlayerController() {
  const togglePlayPause = useCallback(() => {
    usePlayerStore.getState().togglePlayPause()
  }, [])

  const skipBackward = useCallback(() => {
    const { progress, duration, seekTo } = usePlayerStore.getState()
    const target = Math.max(0, progress - SKIP_SECONDS)
    if (duration > 0 || target === 0) {
      seekTo(target)
    }
  }, [])

  const skipForward = useCallback(() => {
    const { progress, duration, seekTo } = usePlayerStore.getState()
    if (!(duration > 0)) return
    const target = Math.max(0, Math.min(duration, progress + SKIP_SECONDS))
    seekTo(target)
  }, [])

  const prevSmart = useCallback(() => {
    const { currentIndex, subtitles } = useTranscriptStore.getState()
    const { seekTo } = usePlayerStore.getState()
    if (currentIndex > 0 && subtitles[currentIndex - 1]) {
      seekTo(subtitles[currentIndex - 1].start)
      return
    }
    skipBackward()
  }, [skipBackward])

  const nextSmart = useCallback(() => {
    const { currentIndex, subtitles } = useTranscriptStore.getState()
    const { seekTo } = usePlayerStore.getState()
    if (currentIndex >= 0 && currentIndex < subtitles.length - 1 && subtitles[currentIndex + 1]) {
      seekTo(subtitles[currentIndex + 1].start)
      return
    }
    skipForward()
  }, [skipForward])

  const jumpToSubtitle = useCallback((index: number) => {
    if (!Number.isInteger(index) || index < 0) return
    const { subtitles } = useTranscriptStore.getState()
    const { seekTo } = usePlayerStore.getState()
    if (!subtitles[index]) return
    seekTo(subtitles[index].start)
  }, [])

  const cyclePlaybackRate = useCallback(() => {
    const { playbackRate, setPlaybackRate } = usePlayerStore.getState()
    const currentIdx = PLAYBACK_RATE_CYCLE.indexOf(
      playbackRate as (typeof PLAYBACK_RATE_CYCLE)[number]
    )
    if (currentIdx === -1) {
      setPlaybackRate(1.0)
      return
    }
    const nextIdx = (currentIdx + 1) % PLAYBACK_RATE_CYCLE.length
    setPlaybackRate(PLAYBACK_RATE_CYCLE[nextIdx])
  }, [])

  return {
    togglePlayPause,
    skipBackward,
    skipForward,
    prevSmart,
    nextSmart,
    jumpToSubtitle,
    cyclePlaybackRate,
  }
}

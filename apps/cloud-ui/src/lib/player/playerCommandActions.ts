import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import {
  resolveNextPlaybackRate,
  resolveNextSubtitleTarget,
  resolvePreviousSubtitleTarget,
  resolveSeekBackwardTarget,
  resolveSeekForwardTarget,
  resolveSeekToTarget,
  resolveSkipBackwardTarget,
  resolveSkipForwardTarget,
  resolveSubtitleJumpTarget,
} from './playerCommands'

const KEYBOARD_SEEK_SECONDS = 15

export function togglePlayerPlayback(): void {
  usePlayerStore.getState().togglePlayPause()
}

export function executeSkipBackward(): void {
  const { progress, duration, seekTo } = usePlayerStore.getState()
  const target = resolveSkipBackwardTarget(progress)
  if (duration > 0 || target === 0) {
    seekTo(target)
  }
}

export function executeSkipForward(): void {
  const { progress, duration, seekTo } = usePlayerStore.getState()
  const target = resolveSkipForwardTarget(progress, duration)
  if (target === null) return
  seekTo(target)
}

export function executePreviousSmartSubtitleOrSkip(): void {
  const { currentIndex, subtitles } = useTranscriptStore.getState()
  const { seekTo } = usePlayerStore.getState()
  const target = resolvePreviousSubtitleTarget(subtitles, currentIndex)
  if (target !== null) {
    seekTo(target)
    return
  }
  executeSkipBackward()
}

export function executeNextSmartSubtitleOrSkip(): void {
  const { currentIndex, subtitles } = useTranscriptStore.getState()
  const { seekTo } = usePlayerStore.getState()
  const target = resolveNextSubtitleTarget(subtitles, currentIndex)
  if (target !== null) {
    seekTo(target)
    return
  }
  executeSkipForward()
}

export function executeJumpToSubtitle(index: number): void {
  const { subtitles } = useTranscriptStore.getState()
  const { seekTo } = usePlayerStore.getState()
  const target = resolveSubtitleJumpTarget(subtitles, index)
  if (target === null) return
  seekTo(target)
}

export function cyclePlayerPlaybackRate(): void {
  const { playbackRate, setPlaybackRate } = usePlayerStore.getState()
  setPlaybackRate(resolveNextPlaybackRate(playbackRate))
}

export function executeMediaSessionSeekBackward(): void {
  const { progress, duration, seekTo } = usePlayerStore.getState()
  const target = resolveSeekBackwardTarget(progress, duration)
  if (target === null) return
  seekTo(target)
}

export function executeMediaSessionSeekForward(): void {
  const { progress, duration, seekTo } = usePlayerStore.getState()
  const target = resolveSeekForwardTarget(progress, duration)
  if (target === null) return
  seekTo(target)
}

export function executeMediaSessionSeekTo(seekTime: number | undefined): void {
  const { duration, seekTo } = usePlayerStore.getState()
  const target = typeof seekTime === 'number' ? resolveSeekToTarget(seekTime, duration) : null
  if (target === null) return
  seekTo(target)
}

export function executeKeyboardSeekBackward(): void {
  const { progress, seekTo } = usePlayerStore.getState()
  seekTo(Math.max(0, progress - KEYBOARD_SEEK_SECONDS))
}

export function executeKeyboardSeekForward(): void {
  const { progress, duration, seekTo } = usePlayerStore.getState()
  seekTo(duration > 0 ? Math.min(duration, progress + KEYBOARD_SEEK_SECONDS) : progress + KEYBOARD_SEEK_SECONDS)
}

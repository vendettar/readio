const DEFAULT_SKIP_SECONDS = 10
const SEEK_BACK_SECONDS = 10
const SEEK_FORWARD_SECONDS = 30
const PLAYBACK_RATE_CYCLE = [0.8, 1.0, 1.25, 1.5, 2.0] as const

function clampToDuration(timeSeconds: number, duration: number): number {
  return Math.max(0, Math.min(duration, timeSeconds))
}

export function resolveSkipBackwardTarget(progress: number): number {
  return Math.max(0, progress - DEFAULT_SKIP_SECONDS)
}

export function resolveSkipForwardTarget(
  progress: number,
  duration: number
): number | null {
  if (!(duration > 0)) return null
  return clampToDuration(progress + DEFAULT_SKIP_SECONDS, duration)
}

export function resolveSeekBackwardTarget(
  progress: number,
  duration: number
): number | null {
  if (!(duration > 0)) return null
  return clampToDuration(progress - SEEK_BACK_SECONDS, duration)
}

export function resolveSeekForwardTarget(
  progress: number,
  duration: number
): number | null {
  if (!(duration > 0)) return null
  return clampToDuration(progress + SEEK_FORWARD_SECONDS, duration)
}

export function resolveSeekToTarget(
  seekTime: number,
  duration: number
): number | null {
  if (!Number.isFinite(seekTime) || !(duration > 0)) return null
  return clampToDuration(seekTime, duration)
}

export function resolveSubtitleJumpTarget(
  subtitles: Array<{ start: number }>,
  index: number
): number | null {
  if (!Number.isInteger(index) || index < 0) return null
  const subtitle = subtitles[index]
  return subtitle ? subtitle.start : null
}

export function resolvePreviousSubtitleTarget(
  subtitles: Array<{ start: number }>,
  currentIndex: number
): number | null {
  if (currentIndex <= 0) return null
  const subtitle = subtitles[currentIndex - 1]
  return subtitle ? subtitle.start : null
}

export function resolveNextSubtitleTarget(
  subtitles: Array<{ start: number }>,
  currentIndex: number
): number | null {
  if (currentIndex < 0 || currentIndex >= subtitles.length - 1) return null
  const subtitle = subtitles[currentIndex + 1]
  return subtitle ? subtitle.start : null
}

export function resolveNextPlaybackRate(playbackRate: number): number {
  const currentIdx = PLAYBACK_RATE_CYCLE.indexOf(
    playbackRate as (typeof PLAYBACK_RATE_CYCLE)[number]
  )
  if (currentIdx === -1) {
    return 1.0
  }
  const nextIdx = (currentIdx + 1) % PLAYBACK_RATE_CYCLE.length
  return PLAYBACK_RATE_CYCLE[nextIdx]
}

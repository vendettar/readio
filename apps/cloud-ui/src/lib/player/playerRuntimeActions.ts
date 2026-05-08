import { usePlayerStore } from '../../store/playerStore'

interface AudioTimeSnapshot {
  currentTime: number
  paused: boolean
  ended: boolean
}

export function handleAudioTimeUpdate(snapshot: AudioTimeSnapshot): void {
  const playerState = usePlayerStore.getState()
  playerState.updateProgress(snapshot.currentTime)

  if (
    playerState.status === 'loading' &&
    playerState.isPlaying &&
    !snapshot.paused &&
    !snapshot.ended &&
    snapshot.currentTime > 0
  ) {
    playerState.setStatus('playing')
  }
}

export function handleAudioDurationChange(duration: number): void {
  usePlayerStore.getState().setDuration(duration)
}

export function shouldIgnoreAudioPauseWhileRecovering(isRecovering: boolean): boolean {
  return isRecovering && usePlayerStore.getState().isPlaying
}

export async function handleAudioEnded(endedProgress: number): Promise<void> {
  await usePlayerStore.getState().handleEndedPlayback(endedProgress)
}

export function handleAudioWaiting(): void {
  const playerState = usePlayerStore.getState()
  if (playerState.isPlaying) {
    playerState.setStatus('loading')
  }
}

export function handleAudioPlaying(): void {
  usePlayerStore.getState().setStatus('playing')
}

export function handleAudioCanPlay(): void {
  const playerState = usePlayerStore.getState()
  if (playerState.status === 'loading') {
    playerState.setStatus(playerState.isPlaying ? 'playing' : 'paused')
  }
}

export function handleAudioError(message: string): void {
  usePlayerStore.getState().setPlayerError(message)
}

export function playPlayerRuntime(): void {
  usePlayerStore.getState().play()
}

export function pausePlayerRuntime(): void {
  usePlayerStore.getState().pause()
}

export function beginProxyAudioRecovery(proxiedUrl: string): boolean {
  const playerState = usePlayerStore.getState()
  const shouldResumePlayback = playerState.isPlaying
  playerState.setStatus('loading')
  playerState.setPlaybackSourceUrl(proxiedUrl)
  return shouldResumePlayback
}

export function shouldResumeAfterProxyAudioRecovery(pendingResumePlayback: boolean): boolean {
  return pendingResumePlayback && usePlayerStore.getState().isPlaying
}

export function finalizePendingSeek(): void {
  const playerState = usePlayerStore.getState()
  playerState.clearPendingSeek()

  if (playerState.autoplayAfterPendingSeek) {
    playerState.clearAutoplayAfterPendingSeek()
    playerState.play()
  }
}

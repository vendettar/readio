import { usePlayerStore } from '../../store/playerStore'
import { toast } from '../toast'

export function isPlayerCurrentlyPlaying(): boolean {
  return usePlayerStore.getState().isPlaying
}

export function pausePlayerIfActive(): boolean {
  const playerState = usePlayerStore.getState()
  if (!playerState.isPlaying) {
    return false
  }

  playerState.pause()
  return true
}

export function resumePlayerIfNeeded(shouldResume: boolean): void {
  if (!shouldResume) {
    return
  }

  usePlayerStore.getState().play()
}

export function shouldContinueAutoplayRetry(expectedAudioUrl: string, cancelled: boolean): boolean {
  if (cancelled) {
    return false
  }

  const currentState = usePlayerStore.getState()
  return currentState.isPlaying && currentState.audioUrl === expectedAudioUrl
}

export function handleAutoplayBlocked(): void {
  usePlayerStore.getState().pause()
  toast.infoKey('player.autoplayBlocked')
}

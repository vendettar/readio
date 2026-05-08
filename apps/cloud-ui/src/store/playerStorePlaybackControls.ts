import type { PlayerStatus } from './playerStore'

export interface PlayerControlState {
  audioUrl: string | null
  isPlaying: boolean
  status: PlayerStatus
}

export function resolvePlayState(state: PlayerControlState): Partial<PlayerControlState> {
  if (!state.audioUrl) return {}
  if (state.status === 'paused' || state.status === 'idle') {
    return { isPlaying: true, status: 'playing' }
  }
  if (state.status === 'loading') {
    return { isPlaying: true }
  }
  if (state.status === 'error') {
    return { isPlaying: true, status: 'loading' }
  }
  return {}
}

export function resolvePauseState(state: PlayerControlState): Partial<PlayerControlState> {
  if (state.status === 'playing' || state.status === 'loading') {
    return { isPlaying: false, status: 'paused' }
  }
  return { isPlaying: false }
}

export function resolveTogglePlayPauseState(
  state: PlayerControlState
): Partial<PlayerControlState> {
  if (state.isPlaying) {
    return { isPlaying: false, status: 'paused' }
  }
  return resolvePlayState(state)
}

export function resolvePlayerErrorState(
  message?: string
): { nextState: Partial<PlayerControlState>; kind: 'autoplay-blocked' | 'error' } {
  if (message === 'NotAllowedError') {
    return {
      kind: 'autoplay-blocked',
      nextState: { status: 'paused', isPlaying: false },
    }
  }

  return {
    kind: 'error',
    nextState: { status: 'error', isPlaying: false },
  }
}

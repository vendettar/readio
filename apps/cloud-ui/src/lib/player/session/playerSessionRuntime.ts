import { usePlayerStore } from '../../../store/playerStore'
import type { PlaybackSession } from '../../dexieDb'
import { log } from '../../logger'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'
import { resolvePlaybackStateIdentityKey } from '../playbackIdentity'
import {
  applyPlaybackSessionRestore,
  type RestoreAppliedEntry,
} from './playerRestoreProgressResolver'

export interface PlaybackRestoreTarget {
  sessionId: string
  playbackIdentity: string
  restoreKey: string
}

export function applyExistingManagedPlaybackSession(
  session: Pick<PlaybackSession, 'id' | 'progress' | 'durationSeconds'>
): void {
  const playerState = usePlayerStore.getState()
  playerState.setSessionId(session.id)

  if (session.progress > 0) {
    playerState.setProgress(session.progress)
    playerState.seekTo(session.progress)
  }

  if (session.durationSeconds) {
    playerState.setDuration(session.durationSeconds)
  }
}

export function resolveCurrentPlaybackRestoreTarget(
  state: Pick<
    ReturnType<typeof usePlayerStore.getState>,
    'sessionId' | 'localTrackId' | 'audioUrl' | 'episodeMetadata'
  > = usePlayerStore.getState()
): PlaybackRestoreTarget | null {
  if (!state.sessionId) {
    return null
  }

  const playbackIdentity = resolvePlaybackStateIdentityKey(state) ?? ''
  return {
    sessionId: state.sessionId,
    playbackIdentity,
    restoreKey: `${state.sessionId}::${playbackIdentity}`,
  }
}

export function isPlaybackRestoreTargetCurrent(target: PlaybackRestoreTarget): boolean {
  const liveTarget = resolveCurrentPlaybackRestoreTarget()
  return (
    !!liveTarget &&
    liveTarget.sessionId === target.sessionId &&
    liveTarget.playbackIdentity === target.playbackIdentity
  )
}

export async function restorePlaybackProgressForTarget(input: {
  audioElement: HTMLAudioElement
  target: PlaybackRestoreTarget
  restoreInFlight: Set<string>
  restoreApplied: Map<string, RestoreAppliedEntry>
  completedRestoreThresholdSeconds: number
  setProgress: (time: number) => void
}): Promise<void> {
  if (input.restoreInFlight.has(input.target.restoreKey)) {
    return
  }

  try {
    input.restoreInFlight.add(input.target.restoreKey)
    const session = await PlaybackRepository.getPlaybackSession(input.target.sessionId)
    if (!isPlaybackRestoreTargetCurrent(input.target) || !session) {
      return
    }

    const now = Date.now()
    await applyPlaybackSessionRestore({
      audioElement: input.audioElement,
      session,
      sessionId: input.target.sessionId,
      now,
      completedRestoreThresholdSeconds: input.completedRestoreThresholdSeconds,
      restoreKey: input.target.restoreKey,
      restoreApplied: input.restoreApplied,
      isRestoreTargetCurrent: () => isPlaybackRestoreTargetCurrent(input.target),
      setProgress: input.setProgress,
      resetCompletedProgress: async () => {
        await PlaybackRepository.updatePlaybackSession(input.target.sessionId, { progress: 0 })
      },
      log,
    })
  } finally {
    input.restoreInFlight.delete(input.target.restoreKey)
  }
}

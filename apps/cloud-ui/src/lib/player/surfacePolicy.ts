import type { Favorite, PlaybackSession } from '../dexieDb'
import type { Episode, SearchEpisode } from '../discovery'

export type PlayerSurfaceMode = 'docked' | 'mini'

export interface PlayerSurfacePolicy {
  playableContext: boolean
  mode: PlayerSurfaceMode
}

export interface PlayerSurfaceActions {
  setPlayableContext: (enabled: boolean) => void
  toDocked: () => void
  toMini: () => void
}

function derivePolicyFromTranscriptUrl(
  _transcriptUrl: string | null | undefined
): PlayerSurfacePolicy {
  return {
    playableContext: true,
    mode: 'docked',
  }
}

export function deriveSurfacePolicyFromHistorySession(
  session: Pick<PlaybackSession, 'transcriptUrl'>
): PlayerSurfacePolicy {
  return derivePolicyFromTranscriptUrl(session.transcriptUrl)
}

export function deriveSurfacePolicyFromFavorite(
  favorite: Pick<Favorite, 'transcriptUrl'>
): PlayerSurfacePolicy {
  return derivePolicyFromTranscriptUrl(favorite.transcriptUrl)
}

export function deriveSurfacePolicyFromEpisode(
  episode: Pick<Episode, 'transcriptUrl'>
): PlayerSurfacePolicy {
  return derivePolicyFromTranscriptUrl(episode.transcriptUrl)
}

export function deriveSurfacePolicyFromSearchEpisode(_episode: SearchEpisode): PlayerSurfacePolicy {
  // Apple search payload does not include transcriptUrl.
  return derivePolicyFromTranscriptUrl(undefined)
}

export function applySurfacePolicy(
  actions: PlayerSurfaceActions,
  policy: PlayerSurfacePolicy
): void {
  actions.setPlayableContext(policy.playableContext)
  if (policy.mode === 'docked') {
    actions.toDocked()
    return
  }
  actions.toMini()
}

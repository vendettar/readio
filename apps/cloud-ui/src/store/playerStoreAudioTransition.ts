import type { EpisodeMetadataInput } from '../lib/player/playbackMetadata'
import { resolvePlaybackContentIdentityKey } from '../lib/player/playbackMetadata'

export type PlayerStoreAudioTransitionState = {
  audioUrl: string | null
  playbackSourceUrl: string | null
  audioTitle: string
  coverArtUrl: string | Blob | null
  episodeMetadata: EpisodeMetadataInput | null
  audioLoaded: boolean
  autoplayAfterPendingSeek: boolean
  sessionPersistenceSuspended: boolean
  isPlaying: boolean
  progress: number
  localTrackId: string | null
  duration: number
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  sessionId: string | null
  loadRequestId: number
}

type AudioTransitionInput = {
  url: string | null
  title: string
  coverArt: string | Blob | null
  metadata: EpisodeMetadataInput | null
  isPlayingOverride?: boolean
  nextDurationSeconds?: number
}

type BlobLoadTransitionInput = {
  url: string
  title: string
  coverArt: string | Blob | null
  sessionId: string | null
  metadata: EpisodeMetadataInput | null
  nextDurationSeconds: number
}

export type PlayerStoreAudioTransition =
  | {
      kind: 'same-track'
      nextStatePatch: Partial<PlayerStoreAudioTransitionState>
      shouldResetTranscript: false
    }
  | {
      kind: 'same-track-url-swap'
      nextStatePatch: Partial<PlayerStoreAudioTransitionState>
      shouldResetTranscript: false
    }
  | {
      kind: 'new-track'
      nextStatePatch: Partial<PlayerStoreAudioTransitionState>
      shouldResetTranscript: true
    }

export function resolvePlayerStoreAudioTransition(
  state: PlayerStoreAudioTransitionState,
  input: AudioTransitionInput
): PlayerStoreAudioTransition {
  const nextTrackIdentity = resolvePlaybackContentIdentityKey({
    audioUrl: input.url,
    metadata: input.metadata,
  })
  const currentTrackIdentity = resolvePlaybackContentIdentityKey({
    audioUrl: state.audioUrl,
    metadata: state.episodeMetadata,
  })

  const isSameTrack =
    !!nextTrackIdentity && nextTrackIdentity === currentTrackIdentity && state.status !== 'error'
  const isSameTrackButDifferentUrl = isSameTrack && input.url !== state.audioUrl

  if (isSameTrack && input.url === state.audioUrl) {
    return {
      kind: 'same-track',
      shouldResetTranscript: false,
      nextStatePatch: {
        audioTitle: input.title,
        coverArtUrl: input.coverArt,
        episodeMetadata: input.metadata,
        audioLoaded: !!input.url,
        autoplayAfterPendingSeek: false,
        sessionPersistenceSuspended: false,
        ...(input.nextDurationSeconds !== undefined ? { duration: input.nextDurationSeconds } : {}),
      },
    }
  }

  if (isSameTrackButDifferentUrl) {
    return {
      kind: 'same-track-url-swap',
      shouldResetTranscript: false,
      nextStatePatch: {
        audioUrl: input.url,
        playbackSourceUrl: input.url,
        audioTitle: input.title,
        coverArtUrl: input.coverArt,
        episodeMetadata: input.metadata,
        audioLoaded: !!input.url,
        autoplayAfterPendingSeek: false,
        sessionPersistenceSuspended: false,
        isPlaying:
          input.isPlayingOverride !== undefined
            ? input.isPlayingOverride
            : !!input.url && state.isPlaying,
        ...(input.nextDurationSeconds !== undefined ? { duration: input.nextDurationSeconds } : {}),
      },
    }
  }

  const shouldResetSession = !nextTrackIdentity || nextTrackIdentity !== currentTrackIdentity

  return {
    kind: 'new-track',
    shouldResetTranscript: true,
    nextStatePatch: {
      audioUrl: input.url,
      playbackSourceUrl: input.url,
      audioLoaded: !!input.url,
      audioTitle: input.title,
      coverArtUrl: input.coverArt,
      episodeMetadata: input.metadata,
      autoplayAfterPendingSeek: false,
      status: input.url || input.title ? 'loading' : 'idle',
      isPlaying: input.isPlayingOverride !== undefined ? input.isPlayingOverride : !!input.url,
      ...(shouldResetSession
        ? {
            sessionId: null,
            sessionPersistenceSuspended: false,
            progress: 0,
            localTrackId: null,
            duration: input.url ? (input.nextDurationSeconds ?? 0) : 0,
          }
        : { sessionPersistenceSuspended: false }),
      ...(input.nextDurationSeconds !== undefined ? { duration: input.nextDurationSeconds } : {}),
      loadRequestId: state.loadRequestId + 1,
    },
  }
}

export function resolvePlayerStoreBlobLoadTransition(
  state: PlayerStoreAudioTransitionState,
  input: BlobLoadTransitionInput
): Partial<PlayerStoreAudioTransitionState> {
  return {
    audioUrl: input.url,
    playbackSourceUrl: input.url,
    audioLoaded: true,
    audioTitle: input.title,
    coverArtUrl: input.coverArt,
    episodeMetadata: input.metadata,
    status: 'loading',
    isPlaying: true,
    sessionId: input.sessionId,
    sessionPersistenceSuspended: false,
    progress: 0,
    duration: input.nextDurationSeconds,
    localTrackId: null,
    autoplayAfterPendingSeek: false,
    loadRequestId: state.loadRequestId + 1,
  }
}

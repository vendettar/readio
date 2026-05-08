import type { Favorite, PlaybackSession } from '../dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../discovery'
import { PlaybackRepository } from '../repositories/PlaybackRepository'
import type { SupportedCountry } from '../routes/podcastRoutes'
import {
  type CanonicalPlaybackPayload,
  mapEpisodeToPlaybackPayload,
  mapFavoriteToPlaybackPayload,
  mapSearchEpisodeToPlaybackPayload,
  mapSessionToPlaybackPayload,
} from './episodeMetadata'
import type {
  CanonicalRemoteEpisodeMetadata,
  EpisodeMetadata,
  EpisodeMetadataInput,
} from './playbackMetadata'
import { normalizeEpisodeMetadata } from './playbackMetadata'
import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from './playbackMode'

type PlaybackModeOptions = {
  mode?: PlaybackRequestMode
}

type CanonicalPlaybackModeOptions = PlaybackModeOptions & {
  countryAtSave: SupportedCountry
}

type ManagedPlaybackPayload<TMetadata extends EpisodeMetadata = EpisodeMetadata> = {
  audioUrl: string
  title: string
  artwork: string
  metadata: TMetadata
  transcriptUrl?: string
  streamTarget?: RemoteStreamTargetCandidates
}

export interface RemotePlaybackDeps {
  setAudioUrl: (
    url: string | null,
    title?: string,
    coverArt?: string | Blob | null,
    metadata?: EpisodeMetadata | null,
    isPlaying?: boolean
  ) => void
  play: () => void
  pause: () => void
  setSessionId?: (id: string | null) => void
  setPlaybackTrackId?: (id: string | null) => void
}

export interface RemoteStreamTargetCandidates {
  sourceUrlNormalized?: string | null
  audioUrl?: string | null
}

export type PlaybackStartReason = 'started' | 'stale' | 'no_playable_source' | 'download_failed'

type PlaybackNonStartReason = Exclude<PlaybackStartReason, 'started'>

export type PlaybackStartResult =
  | { started: true; reason: 'started' }
  | { started: false; reason: PlaybackNonStartReason }

type PlaybackReadyContext<TMetadata extends EpisodeMetadata = EpisodeMetadata> = {
  source: { url: string; trackId?: string }
  isStreamWithoutTranscript: boolean
  metadata: TMetadata
  playableTitle: string
}

interface RemotePlaybackEntryPointDeps {
  buildCanonicalRemotePlaybackMetadata: (input: {
    metadata: CanonicalPlaybackPayload['metadata']
    audioUrl: string
    mode: PlaybackRequestMode
    countryAtSave: SupportedCountry
  }) => CanonicalRemoteEpisodeMetadata | null
  createNonStartedResult: (reason: PlaybackNonStartReason) => PlaybackStartResult
  hasStreamTargetForPlayback: (candidates: RemoteStreamTargetCandidates) => boolean
  resolveRemoteStreamTargetUrl: (candidates: RemoteStreamTargetCandidates) => string | null
  runPlaybackFlow: <TMetadata extends EpisodeMetadata>(
    deps: RemotePlaybackDeps,
    payload: ManagedPlaybackPayload<TMetadata>,
    options: {
      mode: PlaybackRequestMode
      onReadyToPlay?: (ctx: PlaybackReadyContext<TMetadata>) => void | Promise<void>
    }
  ) => Promise<PlaybackStartResult>
}

export function createRemotePlaybackEntryPoints(deps: RemotePlaybackEntryPointDeps) {
  async function playRemotePayload(
    playbackDeps: RemotePlaybackDeps,
    payload: CanonicalPlaybackPayload,
    options: CanonicalPlaybackModeOptions
  ): Promise<PlaybackStartResult> {
    const mode = options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT
    const metadata = deps.buildCanonicalRemotePlaybackMetadata({
      metadata: payload.metadata,
      audioUrl: payload.audioUrl,
      mode,
      countryAtSave: options.countryAtSave,
    })
    if (!metadata) {
      return deps.createNonStartedResult('download_failed')
    }

    return deps.runPlaybackFlow(
      playbackDeps,
      {
        ...payload,
        metadata,
      },
      {
        mode,
        onReadyToPlay: ({ source, isStreamWithoutTranscript }) => {
          if (isStreamWithoutTranscript) {
            playbackDeps.setPlaybackTrackId?.(null)
          } else if (source.trackId) {
            playbackDeps.setPlaybackTrackId?.(source.trackId)
          }
        },
      }
    )
  }

  async function playEpisodeWithDeps(
    playbackDeps: RemotePlaybackDeps,
    episode: Episode,
    podcast: Podcast,
    options: CanonicalPlaybackModeOptions
  ): Promise<void> {
    const payload = mapEpisodeToPlaybackPayload(episode, podcast)
    await playRemotePayload(playbackDeps, payload, options)
  }

  async function playSearchEpisodeWithDeps(
    playbackDeps: RemotePlaybackDeps,
    episode: SearchEpisode,
    options: CanonicalPlaybackModeOptions
  ): Promise<void> {
    const payload = mapSearchEpisodeToPlaybackPayload(episode)
    await playRemotePayload(playbackDeps, payload, options)
  }

  async function playFavoriteWithDeps(
    playbackDeps: RemotePlaybackDeps,
    favorite: Favorite,
    options: CanonicalPlaybackModeOptions
  ): Promise<void> {
    const payload = mapFavoriteToPlaybackPayload(favorite)
    await playRemotePayload(playbackDeps, payload, options)
  }

  async function playStreamWithoutTranscriptWithDeps(
    playbackDeps: RemotePlaybackDeps,
    payload: {
      streamTarget: RemoteStreamTargetCandidates
      title: string
      artwork: string
      metadata: EpisodeMetadataInput
    }
  ): Promise<PlaybackStartResult> {
    if (!deps.hasStreamTargetForPlayback(payload.streamTarget)) {
      return deps.createNonStartedResult('no_playable_source')
    }

    const playbackMetadata = normalizeEpisodeMetadata(payload.metadata)
    if (!playbackMetadata) {
      return deps.createNonStartedResult('download_failed')
    }

    return deps.runPlaybackFlow(
      playbackDeps,
      {
        audioUrl: deps.resolveRemoteStreamTargetUrl(payload.streamTarget) ?? '',
        title: payload.title,
        artwork: payload.artwork,
        metadata: playbackMetadata,
        streamTarget: payload.streamTarget,
      },
      {
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      }
    )
  }

  async function playHistorySessionWithDeps(
    playbackDeps: RemotePlaybackDeps,
    session: PlaybackSession,
    options?: PlaybackModeOptions
  ): Promise<boolean> {
    const payload = mapSessionToPlaybackPayload(session)
    if (!payload) return false

    const mode = options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT
    const startResult = await deps.runPlaybackFlow<EpisodeMetadata>(playbackDeps, payload, {
      mode,
      onReadyToPlay: async ({ source, isStreamWithoutTranscript }) => {
        let finalTrackId = source.trackId
        if (isStreamWithoutTranscript) {
          playbackDeps.setPlaybackTrackId?.(null)
        } else if (!finalTrackId && session.localTrackId) {
          const trackExists = await PlaybackRepository.trackExists(session.localTrackId)
          if (trackExists) {
            finalTrackId = session.localTrackId
          }
        }

        if (finalTrackId) {
          playbackDeps.setPlaybackTrackId?.(finalTrackId)
        }
        playbackDeps.setSessionId?.(session.id)
      },
    })
    return startResult.started
  }

  return {
    playEpisodeWithDeps,
    playSearchEpisodeWithDeps,
    playFavoriteWithDeps,
    playStreamWithoutTranscriptWithDeps,
    playHistorySessionWithDeps,
  }
}

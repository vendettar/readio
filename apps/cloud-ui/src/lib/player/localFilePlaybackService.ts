import type { ASRCue } from '../asr/types'
import type { FileSubtitle, FileTrack } from '../dexieDb'
import { FilesRepository } from '../repositories/FilesRepository'
import { PlaybackRepository } from '../repositories/PlaybackRepository'
import { createLocalEpisodeMetadata } from './playbackMetadata'
import { buildLocalTrackPlaybackSessionCreateInput } from './session/playbackSessionFactory'

export const LOCAL_FILE_PLAYBACK_PREPARE_REASON = {
  AUDIO_NOT_FOUND: 'audio_not_found',
} as const

export interface PreparedLocalFilePlayback {
  audioBlob: Blob
  artwork: Blob | string | null
  subtitles: ASRCue[]
  sessionId: string
  metadata: ReturnType<typeof createLocalEpisodeMetadata>
  selectedSubtitleContentId: string | null
}

export type PrepareLocalFilePlaybackResult =
  | {
      ok: true
      payload: PreparedLocalFilePlayback
    }
  | {
      ok: false
      reason: (typeof LOCAL_FILE_PLAYBACK_PREPARE_REASON)[keyof typeof LOCAL_FILE_PLAYBACK_PREPARE_REASON]
    }

function selectTrackSubtitle(input: {
  track: FileTrack
  availableSubtitles: FileSubtitle[]
  subtitle?: FileSubtitle
}): FileSubtitle | undefined {
  const trackSubtitles = input.availableSubtitles.filter(
    (entry) => entry.trackId === input.track.id
  )
  if (input.subtitle) {
    return input.subtitle
  }
  if (trackSubtitles.length === 0) {
    return undefined
  }
  return (
    trackSubtitles.find((entry) => entry.id === input.track.activeSubtitleId) ?? trackSubtitles[0]
  )
}

export async function prepareLocalFilePlayback(input: {
  track: FileTrack
  availableSubtitles: FileSubtitle[]
  subtitle?: FileSubtitle
}): Promise<PrepareLocalFilePlaybackResult> {
  const audioBlobRecord = await FilesRepository.getAudioBlob(input.track.audioId)
  if (!audioBlobRecord) {
    return {
      ok: false,
      reason: LOCAL_FILE_PLAYBACK_PREPARE_REASON.AUDIO_NOT_FOUND,
    }
  }

  const artwork = await FilesRepository.resolveTrackArtwork(input.track.id)
  const selectedSubtitle = selectTrackSubtitle(input)

  let subtitles: ASRCue[] = []
  if (selectedSubtitle) {
    const subtitleText = await PlaybackRepository.getSubtitle(selectedSubtitle.subtitleId)
    if (subtitleText) {
      subtitles = subtitleText.cues
    }
  }

  return {
    ok: true,
    payload: {
      audioBlob: audioBlobRecord.blob,
      artwork,
      subtitles,
      sessionId: `local-track-${input.track.id}`,
      metadata: createLocalEpisodeMetadata({
        showTitle: input.track.artist || undefined,
        description: input.track.album || undefined,
        artworkUrl: typeof artwork === 'string' ? artwork : undefined,
        durationSeconds: input.track.durationSeconds,
      }),
      selectedSubtitleContentId: selectedSubtitle?.subtitleId ?? null,
    },
  }
}

export function persistLocalFilePlaybackSession(input: {
  track: FileTrack
  sessionId: string
  selectedSubtitleContentId: string | null
  artwork: Blob | string | null
}): Promise<string> {
  return PlaybackRepository.upsertPlaybackSession(
    buildLocalTrackPlaybackSessionCreateInput({
      sessionId: input.sessionId,
      track: input.track,
      subtitleId: input.selectedSubtitleContentId,
      artworkUrl: typeof input.artwork === 'string' ? input.artwork : undefined,
    })
  )
}

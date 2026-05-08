import type { ASRCue } from '../asr/types'
import { checkDownloadCapacity } from '../downloadCapacity'
import { PlaybackRepository } from '../repositories/PlaybackRepository'

export const MANUAL_PLAYBACK_AUDIO_PERSIST_REASON = {
  STORED: 'stored',
  BLOCKED_BY_QUOTA: 'blocked_by_quota',
} as const

export type ManualPlaybackAudioPersistReason =
  (typeof MANUAL_PLAYBACK_AUDIO_PERSIST_REASON)[keyof typeof MANUAL_PLAYBACK_AUDIO_PERSIST_REASON]

export interface ManualPlaybackAudioPersistResult {
  ok: boolean
  reason: ManualPlaybackAudioPersistReason
  audioId?: string
}

export interface ManualPlaybackSubtitlePersistResult {
  ok: true
  subtitleId: string
}

export async function persistManualPlaybackAudio(input: {
  file: File
  getCurrentSessionId: () => string | null
}): Promise<ManualPlaybackAudioPersistResult> {
  const capacity = await checkDownloadCapacity(input.file.size)
  if (!capacity.allowed) {
    return {
      ok: false,
      reason: MANUAL_PLAYBACK_AUDIO_PERSIST_REASON.BLOCKED_BY_QUOTA,
    }
  }

  const audioId = await PlaybackRepository.addAudioBlob(input.file, input.file.name)
  const currentSessionId = input.getCurrentSessionId()
  if (currentSessionId) {
    await PlaybackRepository.updatePlaybackSession(currentSessionId, {
      audioId,
      audioFilename: input.file.name,
      hasAudioBlob: true,
      sizeBytes: input.file.size,
    })
  }

  return {
    ok: true,
    reason: MANUAL_PLAYBACK_AUDIO_PERSIST_REASON.STORED,
    audioId,
  }
}

export async function persistManualPlaybackSubtitles(input: {
  filename: string
  subtitles: ASRCue[]
  getCurrentSessionId: () => string | null
}): Promise<ManualPlaybackSubtitlePersistResult> {
  const subtitleId = await PlaybackRepository.addSubtitle(input.subtitles, input.filename)
  const currentSessionId = input.getCurrentSessionId()
  if (currentSessionId) {
    await PlaybackRepository.updatePlaybackSession(currentSessionId, {
      subtitleId,
      subtitleFilename: input.filename,
    })
  }

  return {
    ok: true,
    subtitleId,
  }
}

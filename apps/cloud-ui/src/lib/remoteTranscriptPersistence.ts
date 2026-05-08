import { ASRClientError } from './asr'
import type { ASRCue } from './asr/types'
import { isPodcastDownloadTrack, isUserUploadTrack } from './db/types'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { FilesRepository } from './repositories/FilesRepository'
import {
  normalizeAsrAudioUrl,
  persistRemoteTranscriptRecord,
} from './remoteTranscriptResource'

const ASR_LOCAL_SUBTITLE_PREFIX = 'ASR'

function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatAsrSubtitleName(input: {
  episodeTitle: string
  provider: string
  model: string
}): {
  subtitleName: string
  subtitleFilename: string
} {
  const episodeTitle = input.episodeTitle.trim() || ASR_LOCAL_SUBTITLE_PREFIX
  const provider = input.provider.trim() || 'asr'
  const model = input.model.trim() || 'model'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const subtitleName = `${episodeTitle} - ${provider} - ${model} - ${timestamp}`
  const safeFilename = sanitizeFilenameSegment(subtitleName)
  return {
    subtitleName,
    subtitleFilename: `${safeFilename}.srt`,
  }
}

export async function persistImportedTranscriptForPlaybackIdentity(
  expectedAudioUrl: string,
  cues: ASRCue[]
): Promise<boolean> {
  const normalizedAudioUrl = normalizeAsrAudioUrl(expectedAudioUrl)
  if (!normalizedAudioUrl || cues.length === 0) return false

  await persistRemoteTranscriptRecord({
    url: normalizedAudioUrl,
    cues,
    source: 'manual_upload',
  })
  return true
}

export async function persistAsrResult(options: {
  expectedAudioUrl: string
  localTrackId: string | null
  episodeTitle: string
  model: string
  provider: string
  cues: ASRCue[]
  taskStartedAt: number
  fingerprint?: string
}): Promise<void> {
  const {
    expectedAudioUrl,
    localTrackId,
    episodeTitle,
    model,
    provider,
    cues,
    taskStartedAt,
    fingerprint,
  } = options

  if (localTrackId) {
    const track = await FilesRepository.getTrackById(localTrackId)
    if (!track) {
      throw new ASRClientError('Missing local track or download', 'client_error')
    }

    const { subtitleFilename, subtitleName } = formatAsrSubtitleName({
      episodeTitle,
      provider,
      model,
    })

    if (isUserUploadTrack(track)) {
      const persistResult = await FilesRepository.upsertAsrSubtitleVersion({
        trackId: localTrackId,
        cues,
        subtitleName,
        subtitleFilename,
        provider,
        model,
        fingerprint,
        setActive: true,
      })
      if (!persistResult.ok || !persistResult.fileSubtitleId) {
        throw new ASRClientError('Missing local track or download', 'client_error')
      }
      return
    }

    if (isPodcastDownloadTrack(track)) {
      const persistResult = await DownloadsRepository.upsertAsrSubtitleVersion({
        trackId: localTrackId,
        cues,
        subtitleName,
        subtitleFilename,
        provider,
        model,
        fingerprint,
        setActive: false,
      })
      if (!persistResult.ok || !persistResult.fileSubtitleId) {
        throw new ASRClientError('Missing local track or download', 'client_error')
      }

      if (await DownloadsRepository.shouldAutoSetActive(localTrackId, taskStartedAt)) {
        await DownloadsRepository.setActiveSubtitle(localTrackId, persistResult.fileSubtitleId, false)
      }
      return
    }

    throw new ASRClientError('Missing local track or download', 'client_error')
  }

  const normalizedAudioUrl = normalizeAsrAudioUrl(expectedAudioUrl)
  if (!normalizedAudioUrl) return

  await persistRemoteTranscriptRecord({
    url: normalizedAudioUrl,
    cues,
    asrFingerprint: fingerprint,
    source: `asr-${provider}`,
  })
}

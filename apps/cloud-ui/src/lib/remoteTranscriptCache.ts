import type { ASRCue } from './asr/types'
import { isPodcastDownloadTrack, isUserUploadTrack } from './db/types'
import { sha256 } from './networking/urlUtils'
import { normalizeAsrAudioUrl } from './remoteTranscriptResource'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { FilesRepository } from './repositories/FilesRepository'
import { PlaybackRepository } from './repositories/PlaybackRepository'

export async function computeAsrFingerprint(options: {
  localTrackId: string | null
  audioBlob: Blob
  model: string
}): Promise<string> {
  const { localTrackId, audioBlob, model } = options
  let audioId = 'streaming'
  let downloadedAt = 0

  if (localTrackId) {
    const track = await FilesRepository.getTrackById(localTrackId)
    if (track) {
      audioId = track.audioId
      downloadedAt = isPodcastDownloadTrack(track) ? track.downloadedAt : track.createdAt
    }
  }

  const raw = `${localTrackId ?? 'remote'}|${audioId}|${audioBlob.size}|${model || ''}|${downloadedAt}`
  return await sha256(raw)
}

export async function findTranscriptCuesByFingerprint(
  fingerprint: string
): Promise<ASRCue[] | null> {
  const localSubtitle = await PlaybackRepository.findSubtitleByFingerprint(fingerprint)
  if (localSubtitle && localSubtitle.cues.length > 0) {
    return localSubtitle.cues
  }

  const remoteTranscript = await PlaybackRepository.findRemoteTranscriptByFingerprint(fingerprint)
  if (remoteTranscript && remoteTranscript.cues.length > 0) {
    return remoteTranscript.cues
  }

  return null
}

export async function findStoredTranscriptCues(
  expectedAudioUrl: string,
  localTrackId: string | null
): Promise<ASRCue[] | null> {
  if (localTrackId) {
    const track = await FilesRepository.getTrackById(localTrackId)
    const downloadTrack = track ? null : await DownloadsRepository.getTrackSnapshot(localTrackId)

    if (track || downloadTrack) {
      const readySubtitles = isUserUploadTrack(track)
        ? await FilesRepository.getReadySubtitlesByTrackId(localTrackId)
        : await DownloadsRepository.getReadySubtitlesByTrackId(localTrackId)

      for (const { subtitle } of readySubtitles) {
        if (subtitle.cues.length > 0) {
          return subtitle.cues
        }
      }
      return null
    }
  }

  const normalizedAudioUrl = normalizeAsrAudioUrl(expectedAudioUrl)
  if (!normalizedAudioUrl) return null

  const cached = await PlaybackRepository.getRemoteTranscriptByUrl(normalizedAudioUrl)
  if (cached && cached.cues.length > 0) {
    return cached.cues
  }

  return null
}

export async function hasStoredTranscriptSource(
  expectedAudioUrl: string,
  localTrackId: string | null
): Promise<boolean> {
  return Boolean(await findStoredTranscriptCues(expectedAudioUrl, localTrackId))
}

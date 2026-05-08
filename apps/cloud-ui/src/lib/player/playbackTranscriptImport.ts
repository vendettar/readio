import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { persistImportedTranscriptForPlaybackIdentity } from '../remoteTranscript'
import { DownloadsRepository } from '../repositories/DownloadsRepository'
import { FilesRepository } from '../repositories/FilesRepository'
import { parseSubtitles } from '../subtitles'
import type { PlaybackExportContext } from './export/playbackExportContext'
import { resolvePlaybackSourceAudioUrl, withPlaybackRequestMode } from './playbackMetadata'
import { PLAYBACK_REQUEST_MODE } from './playbackMode'

export interface TranscriptImportResult {
  ok: boolean
  reason:
    | 'imported'
    | 'no_playback_identity'
    | 'invalid_transcript_content'
    | 'track_not_found'
    | 'track_type_unsupported'
    | 'failed'
  fileSubtitleId?: string
  playbackIdentityKey?: string
}

async function importTranscriptForUserUpload(
  trackId: string,
  filename: string,
  content: string
): Promise<string | null> {
  const importResult = await FilesRepository.importTranscriptVersion(trackId, {
    filename,
    content,
  })
  if (!importResult.ok || !importResult.fileSubtitleId) {
    return null
  }

  await FilesRepository.updateFileTrack(trackId, {
    activeSubtitleId: importResult.fileSubtitleId,
  })

  return importResult.fileSubtitleId
}

async function importTranscriptForDownloadedPodcast(
  trackId: string,
  filename: string,
  content: string
): Promise<string | null> {
  const importResult = await DownloadsRepository.importSubtitleVersion(trackId, {
    filename,
    content,
  })
  if (!importResult.ok || !importResult.fileSubtitleId) {
    return null
  }

  const setActive = await DownloadsRepository.setActiveSubtitle(
    trackId,
    importResult.fileSubtitleId,
    true
  )
  if (!setActive) {
    await DownloadsRepository.deleteSubtitleVersion(trackId, importResult.fileSubtitleId)
    return null
  }

  return importResult.fileSubtitleId
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return await file.text()
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export async function importTranscriptForPlaybackContext(
  context: PlaybackExportContext,
  file: File
): Promise<TranscriptImportResult> {
  const text = await readFileAsText(file)
  const cues = parseSubtitles(text)
  if (cues.length === 0) {
    return {
      ok: false,
      reason: 'invalid_transcript_content',
      playbackIdentityKey: context.identity.playbackIdentityKey,
    }
  }

  const fail = (reason: TranscriptImportResult['reason']): TranscriptImportResult => ({
    ok: false,
    reason,
    playbackIdentityKey: context.identity.playbackIdentityKey,
  })

  let result: TranscriptImportResult

  if (context.trackKind === 'user-upload' && context.resolvedLocalTrackId) {
    const fileSubtitleId = await importTranscriptForUserUpload(
      context.resolvedLocalTrackId,
      file.name,
      text
    )
    result = fileSubtitleId
      ? {
          ok: true,
          reason: 'imported',
          fileSubtitleId,
          playbackIdentityKey: context.identity.playbackIdentityKey,
        }
      : fail('failed')
  } else if (context.trackKind === 'podcast-download' && context.resolvedLocalTrackId) {
    const fileSubtitleId = await importTranscriptForDownloadedPodcast(
      context.resolvedLocalTrackId,
      file.name,
      text
    )
    result = fileSubtitleId
      ? {
          ok: true,
          reason: 'imported',
          fileSubtitleId,
          playbackIdentityKey: context.identity.playbackIdentityKey,
        }
      : fail('failed')
  } else if (context.canFallbackToCanonicalRemote) {
    const persisted = await persistImportedTranscriptForPlaybackIdentity(
      resolvePlaybackSourceAudioUrl(context.identity.audioUrl, context.identity.episodeMetadata),
      cues
    )
    result = persisted
      ? {
          ok: true,
          reason: 'imported',
          playbackIdentityKey: context.identity.playbackIdentityKey,
        }
      : fail('failed')
  } else if (context.hasMissingLocalTrackBinding) {
    result = fail('track_not_found')
  } else {
    result = fail('track_type_unsupported')
  }

  if (!result.ok) {
    return result
  }

  useTranscriptStore.getState().setSubtitles(cues)
  const episodeMetadata = context.identity.episodeMetadata
  if (episodeMetadata) {
    const playbackMetadata = withPlaybackRequestMode(episodeMetadata, PLAYBACK_REQUEST_MODE.DEFAULT)
    if (playbackMetadata) {
      usePlayerStore.getState().setEpisodeMetadata(playbackMetadata)
    }
  }

  return result
}

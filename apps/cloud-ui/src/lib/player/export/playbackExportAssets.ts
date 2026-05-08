import { useTranscriptStore } from '../../../store/transcriptStore'
import type { ASRCue } from '../../asr/types'
import {
  buildDownloadJobOptionsFromCanonicalRemoteMetadata,
  downloadEpisode,
  removeDownloadedTrack,
} from '../../downloadService'
import { loadRemoteTranscriptWithCache } from '../../remoteTranscript'
import { DownloadsRepository } from '../../repositories/DownloadsRepository'
import { FilesRepository } from '../../repositories/FilesRepository'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'
import {
  getSubtitleExportMimeType,
  type SubtitleExportFormat,
  serializeSubtitleExport,
} from '../../subtitles'
import type { PlaybackExportContext } from './playbackExportContext'
import { resolvePlaybackExportBaseName } from '../playbackIdentity'
import { resolveCanonicalRemotePlaybackSource } from '../playbackMetadata'

export interface ExportAsset {
  filename: string
  blob: Blob
  cleanup?: () => Promise<void>
}

function buildTranscriptBlobAsset(input: {
  cues: ASRCue[]
  fileNameBase: string
  format: SubtitleExportFormat
}): ExportAsset {
  const filename = `${input.fileNameBase}.transcript.${input.format}`
  return {
    filename,
    blob: new Blob([serializeSubtitleExport(input.cues, input.format)], {
      type: getSubtitleExportMimeType(input.format),
    }),
  }
}

export async function resolveTranscriptExportAsset(
  context: PlaybackExportContext,
  format: SubtitleExportFormat
): Promise<ExportAsset | null> {
  if (context.trackKind === 'user-upload' && context.resolvedLocalTrackId) {
    const result = await FilesRepository.exportActiveTranscriptVersion(
      context.resolvedLocalTrackId,
      context.identity.audioTitle,
      format
    )
    return result.ok && result.filename && result.blob
      ? { filename: result.filename, blob: result.blob }
      : null
  }

  if (context.trackKind === 'podcast-download' && context.resolvedLocalTrackId) {
    const result = await DownloadsRepository.exportActiveTranscriptVersion(
      context.resolvedLocalTrackId,
      context.identity.audioTitle,
      format
    )
    return result.ok && result.filename && result.blob
      ? { filename: result.filename, blob: result.blob }
      : null
  }

  const loadedSubtitles = useTranscriptStore.getState().subtitles
  if (loadedSubtitles.length > 0) {
    return buildTranscriptBlobAsset({
      cues: loadedSubtitles,
      fileNameBase: resolvePlaybackExportBaseName(context.identity),
      format,
    })
  }

  const normalizedAudioUrl = context.identity.normalizedAudioUrl || ''
  if (normalizedAudioUrl) {
    const cached = await PlaybackRepository.getRemoteTranscriptByUrl(normalizedAudioUrl)
    if (cached?.cues?.length) {
      return buildTranscriptBlobAsset({
        cues: cached.cues,
        fileNameBase: resolvePlaybackExportBaseName(context.identity),
        format,
      })
    }
  }

  if (context.transcriptUrl) {
    const loaded = await loadRemoteTranscriptWithCache(context.transcriptUrl)
    if (loaded.ok && loaded.cues.length > 0) {
      return buildTranscriptBlobAsset({
        cues: loaded.cues,
        fileNameBase: resolvePlaybackExportBaseName(context.identity),
        format,
      })
    }
  }

  return null
}

export async function resolveAudioExportAsset(
  context: PlaybackExportContext
): Promise<ExportAsset | null> {
  if (context.trackKind === 'user-upload' && context.resolvedLocalTrackId) {
    const result = await FilesRepository.exportAudioFile(
      context.resolvedLocalTrackId,
      context.identity.audioTitle
    )
    return result.ok && result.filename && result.blob
      ? { filename: result.filename, blob: result.blob }
      : null
  }

  if (context.trackKind === 'podcast-download' && context.resolvedLocalTrackId) {
    const result = await DownloadsRepository.exportAudioFile(
      context.resolvedLocalTrackId,
      context.identity.audioTitle
    )
    return result.ok && result.filename && result.blob
      ? { filename: result.filename, blob: result.blob }
      : null
  }

  const canonicalRemoteSource = resolveCanonicalRemotePlaybackSource({
    audioUrl: context.identity.audioUrl,
    metadata: context.identity.episodeMetadata,
  })
  if (!canonicalRemoteSource) return null

  const downloadOptions = buildDownloadJobOptionsFromCanonicalRemoteMetadata({
    audioUrl: canonicalRemoteSource.audioUrl,
    episodeTitle: context.identity.audioTitle || resolvePlaybackExportBaseName(context.identity),
    metadata: canonicalRemoteSource.metadata,
    silent: true,
  })
  if (!downloadOptions) return null

  const downloaded = await downloadEpisode(downloadOptions)

  if (!downloaded.ok || !downloaded.trackId) {
    return null
  }

  const exported = await DownloadsRepository.exportAudioFile(
    downloaded.trackId,
    context.identity.audioTitle
  )
  if (!exported.ok || !exported.filename || !exported.blob) {
    if (downloaded.reason !== 'already_downloaded') {
      await removeDownloadedTrack(downloaded.trackId, { suppressNotify: true })
    }
    return null
  }

  const downloadedTrackId = downloaded.trackId

  return {
    filename: exported.filename,
    blob: exported.blob,
    cleanup:
      downloaded.reason !== 'already_downloaded'
        ? async () => {
            await removeDownloadedTrack(downloadedTrackId, { suppressNotify: true })
          }
        : undefined,
  }
}

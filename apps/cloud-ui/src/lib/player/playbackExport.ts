import { downloadBlob } from '../download'
import { warn } from '../logger'
import type { SubtitleExportFormat } from '../subtitles'
import { blobToZipBytes, buildSimpleZip } from '../archive/simpleZip'

export type { SubtitleExportFormat } from '../subtitles'
export {
  resolveCurrentPlaybackExportContext,
  type PlaybackExportContext,
} from './playbackExportContext'
export type { TranscriptImportResult } from './playbackTranscriptImport'

import {
  resolvePlaybackExportBaseName,
} from './playbackIdentity'
import {
  resolveAudioExportAsset,
  resolveTranscriptExportAsset,
} from './playbackExportAssets'
import { resolveCurrentPlaybackExportContext } from './playbackExportContext'
import {
  importTranscriptForPlaybackContext,
  type TranscriptImportResult,
} from './playbackTranscriptImport'

export const TRANSCRIPT_IMPORTED_EVENT = 'readio:transcript-imported'

export interface TranscriptImportedEventDetail {
  playbackIdentityKey: string
  localTrackId: string | null
  normalizedAudioUrl: string | null
}

export interface ExportActionResult {
  ok: boolean
  reason:
    | 'exported'
    | 'no_playback_identity'
    | 'no_transcript'
    | 'no_audio'
    | 'track_not_found'
    | 'failed'
  filename?: string
  playbackIdentityKey?: string
}

function dispatchTranscriptImported(detail: TranscriptImportedEventDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TRANSCRIPT_IMPORTED_EVENT, { detail }))
}

export async function importTranscriptForCurrentPlayback(
  file: File
): Promise<TranscriptImportResult> {
  const context = await resolveCurrentPlaybackExportContext()
  if (!context) {
    return { ok: false, reason: 'no_playback_identity' }
  }
  const result = await importTranscriptForPlaybackContext(context, file)
  if (!result.ok) return result

  dispatchTranscriptImported({
    playbackIdentityKey: context.identity.playbackIdentityKey,
    localTrackId: context.resolvedLocalTrackId,
    normalizedAudioUrl: context.identity.normalizedAudioUrl,
  })

  return result
}

export async function exportCurrentTranscriptForPlayback(
  format: SubtitleExportFormat = 'srt'
): Promise<ExportActionResult> {
  const context = await resolveCurrentPlaybackExportContext()
  if (!context) return { ok: false, reason: 'no_playback_identity' }
  if (!context.canExportTranscript) return { ok: false, reason: 'no_transcript' }

  const asset = await resolveTranscriptExportAsset(context, format)
  if (!asset) {
    return {
      ok: false,
      reason: 'no_transcript',
      playbackIdentityKey: context.identity.playbackIdentityKey,
    }
  }

  downloadBlob(asset.blob, asset.filename)
  return {
    ok: true,
    reason: 'exported',
    filename: asset.filename,
    playbackIdentityKey: context.identity.playbackIdentityKey,
  }
}

export async function exportCurrentAudioForPlayback(): Promise<ExportActionResult> {
  const context = await resolveCurrentPlaybackExportContext()
  if (!context) return { ok: false, reason: 'no_playback_identity' }
  if (!context.canExportAudio) {
    return { ok: false, reason: context.hasMissingLocalTrackBinding ? 'track_not_found' : 'no_audio' }
  }

  const asset = await resolveAudioExportAsset(context)
  if (!asset) {
    return {
      ok: false,
      reason: context.hasMissingLocalTrackBinding ? 'track_not_found' : 'no_audio',
      playbackIdentityKey: context.identity.playbackIdentityKey,
    }
  }

  try {
    downloadBlob(asset.blob, asset.filename)
  } finally {
    if (asset.cleanup) {
      await asset.cleanup().catch((error) => {
        warn('[playbackExport] remote audio cleanup failed', error)
      })
    }
  }

  return {
    ok: true,
    reason: 'exported',
    filename: asset.filename,
    playbackIdentityKey: context.identity.playbackIdentityKey,
  }
}

export async function exportCurrentTranscriptAndAudioBundle(): Promise<ExportActionResult> {
  const context = await resolveCurrentPlaybackExportContext()
  if (!context) return { ok: false, reason: 'no_playback_identity' }
  if (!context.canExportTranscript) return { ok: false, reason: 'no_transcript' }
  if (!context.canExportAudio) {
    return { ok: false, reason: context.hasMissingLocalTrackBinding ? 'track_not_found' : 'no_audio' }
  }

  const [transcriptAsset, audioAsset] = await Promise.all([
    resolveTranscriptExportAsset(context, 'srt'),
    resolveAudioExportAsset(context),
  ])

  if (!transcriptAsset || !audioAsset) {
    if (audioAsset?.cleanup) {
      await audioAsset.cleanup().catch((error) => {
        warn('[playbackExport] remote audio cleanup failed', error)
      })
    }
    return { ok: false, reason: transcriptAsset ? 'no_audio' : 'no_transcript' }
  }

  const baseName = resolvePlaybackExportBaseName(context.identity)
  const zipBlob = buildSimpleZip([
    {
      name: transcriptAsset.filename,
      bytes: await blobToZipBytes(transcriptAsset.blob),
    },
    { name: audioAsset.filename, bytes: await blobToZipBytes(audioAsset.blob) },
  ], { useCurrentTimestamp: true })

  try {
    downloadBlob(zipBlob, `${baseName}.transcript-and-audio.zip`)
  } finally {
    if (audioAsset.cleanup) {
      await audioAsset.cleanup().catch((error) => {
        warn('[playbackExport] remote audio cleanup failed', error)
      })
    }
  }

  return {
    ok: true,
    reason: 'exported',
    filename: `${baseName}.transcript-and-audio.zip`,
    playbackIdentityKey: context.identity.playbackIdentityKey,
  }
}

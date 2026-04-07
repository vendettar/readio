import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import type { ASRCue } from '../asr/types'
import type { Track } from '../db/types'
import { isPodcastDownloadTrack, isUserUploadTrack } from '../db/types'
import { DB } from '../dexieDb'
import { downloadBlob } from '../download'
import { downloadEpisode, removeDownloadedTrack } from '../downloadService'
import { warn } from '../logger'
import {
  getValidTranscriptUrl,
  hasStoredTranscriptSource,
  loadRemoteTranscriptWithCache,
  persistImportedTranscriptForPlaybackIdentity,
} from '../remoteTranscript'
import { DownloadsRepository } from '../repositories/DownloadsRepository'
import { FilesRepository } from '../repositories/FilesRepository'
import { normalizeCountryParam } from '../routes/podcastRoutes'
import { getAppConfig } from '../runtimeConfig'
import { parseSubtitles } from '../subtitles'
import {
  type PlaybackIdentitySnapshot,
  resolveCurrentPlaybackIdentity,
  resolvePlaybackExportBaseName,
} from './playbackIdentity'
import { PLAYBACK_REQUEST_MODE } from './playbackMode'

export const TRANSCRIPT_IMPORTED_EVENT = 'readio:transcript-imported'

export interface TranscriptImportedEventDetail {
  playbackIdentityKey: string
  localTrackId: string | null
  normalizedAudioUrl: string | null
}

export interface PlaybackExportContext {
  identity: PlaybackIdentitySnapshot
  track: Track | null
  trackKind: 'user-upload' | 'podcast-download' | null
  transcriptUrl: string | null
  hasLoadedTranscript: boolean
  hasStoredTranscriptSource: boolean
  hasBuiltInTranscriptSource: boolean
  canExportTranscript: boolean
  canExportAudio: boolean
  canExportBundle: boolean
}

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

interface ExportAsset {
  filename: string
  blob: Blob
  cleanup?: () => Promise<void>
}

interface ZipEntry {
  name: string
  bytes: Uint8Array
}

function dispatchTranscriptImported(detail: TranscriptImportedEventDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TRANSCRIPT_IMPORTED_EVENT, { detail }))
}

export async function resolveCurrentPlaybackExportContext(): Promise<PlaybackExportContext | null> {
  const identity = resolveCurrentPlaybackIdentity()
  if (!identity) return null

  const track = identity.localTrackId
    ? ((await FilesRepository.getTrackById(identity.localTrackId)) ??
      (await DownloadsRepository.getTrackSnapshot(identity.localTrackId)) ??
      null)
    : null
  const trackKind = isUserUploadTrack(track)
    ? 'user-upload'
    : isPodcastDownloadTrack(track)
      ? 'podcast-download'
      : null

  const transcriptUrl = getValidTranscriptUrl(identity.episodeMetadata?.transcriptUrl)
  const resolvedAudioUrl = identity.originalAudioUrl || identity.audioUrl || ''
  const hasLoadedTranscript = useTranscriptStore.getState().subtitles.length > 0
  const hasBuiltInTranscriptSource = Boolean(transcriptUrl)
  const hasStoredTranscript = identity.localTrackId
    ? await hasStoredTranscriptSource(resolvedAudioUrl, identity.localTrackId)
    : await hasStoredTranscriptSource(resolvedAudioUrl, null)
  const hasStoredTranscriptSourceForPlayback = hasStoredTranscript || hasBuiltInTranscriptSource
  const canExportTranscript =
    hasLoadedTranscript || hasStoredTranscriptSourceForPlayback || hasBuiltInTranscriptSource
  const canExportAudio = Boolean(
    (trackKind && track) || (!identity.localTrackId && resolvedAudioUrl.trim())
  )

  return {
    identity,
    track,
    trackKind,
    transcriptUrl,
    hasLoadedTranscript,
    hasStoredTranscriptSource: hasStoredTranscriptSourceForPlayback,
    hasBuiltInTranscriptSource,
    canExportTranscript,
    canExportAudio,
    canExportBundle: canExportTranscript && canExportAudio,
  }
}

export async function importTranscriptForCurrentPlayback(
  file: File
): Promise<TranscriptImportResult> {
  const context = await resolveCurrentPlaybackExportContext()
  if (!context) {
    return { ok: false, reason: 'no_playback_identity' }
  }

  const text = await readFileAsText(file)
  const cues = parseSubtitles(text)
  if (cues.length === 0) {
    return {
      ok: false,
      reason: 'invalid_transcript_content',
      playbackIdentityKey: context.identity.playbackIdentityKey,
    }
  }

  const importedByIdentity = async (): Promise<TranscriptImportResult> => {
    if (!context.identity.localTrackId) {
      const persisted = await persistImportedTranscriptForPlaybackIdentity(
        context.identity.originalAudioUrl || context.identity.audioUrl || '',
        cues
      )
      if (!persisted) {
        return {
          ok: false,
          reason: 'failed',
          playbackIdentityKey: context.identity.playbackIdentityKey,
        }
      }
      return {
        ok: true,
        reason: 'imported',
        playbackIdentityKey: context.identity.playbackIdentityKey,
      }
    }

    if (context.trackKind === 'user-upload') {
      const fileSubtitleId = await importTranscriptForUserUpload(
        context.identity.localTrackId,
        file.name,
        text
      )
      if (!fileSubtitleId) {
        return {
          ok: false,
          reason: 'failed',
          playbackIdentityKey: context.identity.playbackIdentityKey,
        }
      }
      return {
        ok: true,
        reason: 'imported',
        fileSubtitleId,
        playbackIdentityKey: context.identity.playbackIdentityKey,
      }
    }

    if (context.trackKind === 'podcast-download') {
      const fileSubtitleId = await importTranscriptForDownloadedPodcast(
        context.identity.localTrackId,
        file.name,
        text
      )
      if (!fileSubtitleId) {
        return {
          ok: false,
          reason: 'failed',
          playbackIdentityKey: context.identity.playbackIdentityKey,
        }
      }
      return {
        ok: true,
        reason: 'imported',
        fileSubtitleId,
        playbackIdentityKey: context.identity.playbackIdentityKey,
      }
    }

    return {
      ok: false,
      reason: 'track_type_unsupported',
      playbackIdentityKey: context.identity.playbackIdentityKey,
    }
  }

  const result = await importedByIdentity()
  if (!result.ok) {
    return result
  }

  useTranscriptStore.getState().setSubtitles(cues)
  const episodeMetadata = context.identity.episodeMetadata
  if (episodeMetadata) {
    usePlayerStore.getState().setEpisodeMetadata({
      ...episodeMetadata,
      playbackRequestMode: PLAYBACK_REQUEST_MODE.DEFAULT,
    })
  }

  dispatchTranscriptImported({
    playbackIdentityKey: context.identity.playbackIdentityKey,
    localTrackId: context.identity.localTrackId,
    normalizedAudioUrl: context.identity.normalizedAudioUrl,
  })

  return result
}

export async function exportCurrentTranscriptForPlayback(): Promise<ExportActionResult> {
  const context = await resolveCurrentPlaybackExportContext()
  if (!context) return { ok: false, reason: 'no_playback_identity' }
  if (!context.canExportTranscript) return { ok: false, reason: 'no_transcript' }

  const asset = await resolveTranscriptExportAsset(context)
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
  if (!context.canExportAudio) return { ok: false, reason: 'no_audio' }

  const asset = await resolveAudioExportAsset(context)
  if (!asset) {
    return {
      ok: false,
      reason: 'no_audio',
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
  if (!context.canExportAudio) return { ok: false, reason: 'no_audio' }

  const [transcriptAsset, audioAsset] = await Promise.all([
    resolveTranscriptExportAsset(context),
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
  ])

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

async function resolveTranscriptExportAsset(
  context: PlaybackExportContext
): Promise<ExportAsset | null> {
  if (context.trackKind === 'user-upload' && context.identity.localTrackId) {
    const result = await FilesRepository.exportActiveTranscriptVersion(
      context.identity.localTrackId,
      context.identity.audioTitle
    )
    return result.ok && result.filename && result.blob
      ? { filename: result.filename, blob: result.blob }
      : null
  }

  if (context.trackKind === 'podcast-download' && context.identity.localTrackId) {
    const result = await DownloadsRepository.exportActiveTranscriptVersion(
      context.identity.localTrackId,
      context.identity.audioTitle
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
    })
  }

  const normalizedAudioUrl = context.identity.normalizedAudioUrl || ''
  if (normalizedAudioUrl) {
    const cached = await DB.getRemoteTranscriptByUrl(normalizedAudioUrl)
    if (cached?.cues?.length) {
      return buildTranscriptBlobAsset({
        cues: cached.cues,
        fileNameBase: resolvePlaybackExportBaseName(context.identity),
      })
    }
  }

  if (context.transcriptUrl) {
    const loaded = await loadRemoteTranscriptWithCache(context.transcriptUrl)
    if (loaded.ok && loaded.cues.length > 0) {
      return buildTranscriptBlobAsset({
        cues: loaded.cues,
        fileNameBase: resolvePlaybackExportBaseName(context.identity),
      })
    }
  }

  return null
}

async function resolveAudioExportAsset(
  context: PlaybackExportContext
): Promise<ExportAsset | null> {
  if (context.trackKind === 'user-upload' && context.identity.localTrackId) {
    const result = await FilesRepository.exportAudioFile(
      context.identity.localTrackId,
      context.identity.audioTitle
    )
    return result.ok && result.filename && result.blob
      ? { filename: result.filename, blob: result.blob }
      : null
  }

  if (context.trackKind === 'podcast-download' && context.identity.localTrackId) {
    const result = await DownloadsRepository.exportAudioFile(
      context.identity.localTrackId,
      context.identity.audioTitle
    )
    return result.ok && result.filename && result.blob
      ? { filename: result.filename, blob: result.blob }
      : null
  }

  const sourceAudioUrl = context.identity.originalAudioUrl || context.identity.audioUrl || ''
  if (!sourceAudioUrl) return null

  const downloaded = await downloadEpisode({
    audioUrl: sourceAudioUrl,
    episodeTitle: context.identity.audioTitle || resolvePlaybackExportBaseName(context.identity),
    episodeDescription: context.identity.episodeMetadata?.description,
    podcastTitle: context.identity.episodeMetadata?.podcastTitle || '',
    feedUrl: context.identity.episodeMetadata?.podcastFeedUrl,
    artworkUrl: context.identity.episodeMetadata?.artworkUrl,
    providerPodcastId: context.identity.episodeMetadata?.providerPodcastId,
    providerEpisodeId:
      context.identity.episodeMetadata?.providerEpisodeId ||
      context.identity.episodeMetadata?.episodeId,
    durationSeconds: context.identity.episodeMetadata?.durationSeconds,
    countryAtSave:
      normalizeCountryParam(context.identity.episodeMetadata?.countryAtSave) ??
      getAppConfig().DEFAULT_COUNTRY,
    silent: true,
  })

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

function buildTranscriptBlobAsset(input: { cues: ASRCue[]; fileNameBase: string }): ExportAsset {
  const filename = `${input.fileNameBase}.transcript.srt`
  return {
    filename,
    blob: new Blob([cuesToSrt(input.cues)], { type: 'text/plain;charset=utf-8' }),
  }
}

function cuesToSrt(cues: ASRCue[]): string {
  const parts: string[] = []
  cues.forEach((cue, index) => {
    parts.push(String(index + 1))
    parts.push(`${formatCueTime(cue.start)} --> ${formatCueTime(cue.end)}`)
    parts.push(cue.text)
    parts.push('')
  })
  return parts.join('\n')
}

async function blobToZipBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }

  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

function formatCueTime(time: number): string {
  const totalMillis = Math.max(0, Math.round(time * 1000))
  const hours = Math.floor(totalMillis / 3_600_000)
  const minutes = Math.floor((totalMillis % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMillis % 60_000) / 1000)
  const millis = totalMillis % 1000
  const pad = (value: number, length: number) => String(value).padStart(length, '0')
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`
}

function buildSimpleZip(files: ZipEntry[]): Blob {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const utf8Name = new TextEncoder().encode(file.name)
    const crc = crc32(file.bytes)
    const { dosDate, dosTime } = getDosTimestamp()
    const localHeader = new Uint8Array(30 + utf8Name.length)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, dosTime, true)
    localView.setUint16(12, dosDate, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, file.bytes.length, true)
    localView.setUint32(22, file.bytes.length, true)
    localView.setUint16(26, utf8Name.length, true)
    localView.setUint16(28, 0, true)
    localHeader.set(utf8Name, 30)

    localParts.push(localHeader, file.bytes)

    const centralHeader = new Uint8Array(46 + utf8Name.length)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, dosTime, true)
    centralView.setUint16(14, dosDate, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, file.bytes.length, true)
    centralView.setUint32(24, file.bytes.length, true)
    centralView.setUint16(28, utf8Name.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, offset, true)
    centralHeader.set(utf8Name, 46)
    centralParts.push(centralHeader)

    offset += localHeader.length + file.bytes.length
  }

  const centralDirOffset = offset
  const centralDirSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralDirSize, true)
  endView.setUint32(16, centralDirOffset, true)
  endView.setUint16(20, 0, true)

  return new Blob(
    [...localParts, ...centralParts, end].map(
      (part) => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer
    ),
    { type: 'application/zip' }
  )
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function getDosTimestamp(): { dosDate: number; dosTime: number } {
  const now = new Date()
  const year = Math.max(1980, now.getFullYear())
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  return { dosDate, dosTime }
}

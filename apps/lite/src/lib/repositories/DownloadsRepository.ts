/**
 * Downloads Repository (Instruction 125b)
 *
 * Single source of truth for subtitle version management on downloaded podcast episodes.
 * All active mapping mutations MUST go through this repository — UI layer direct writes
 * to the local_subtitles table are prohibited.
 *
 * Key patterns:
 * - Active subtitle: at most one per podcast download (PodcastDownload.activeSubtitleId)
 * - Version ordering: createdAt DESC
 * - Fallback on delete: most recent ready version
 * - Concurrency: manualPinnedAt protects user choices from background ASR overwrites
 */

import type { ASRCue } from '../asr/types'
import { formatDateForFilenameUTC } from '../dateUtils'
import type { PlaybackSession } from '../db/types'
import { isPodcastDownloadTrack, TRACK_SOURCE } from '../db/types'
import type { FileSubtitle, PodcastDownload, SubtitleText } from '../dexieDb'
import { DB, db } from '../dexieDb'
import { log, error as logError } from '../logger'
import { cuesToSrt, cuesToVtt, parseSubtitles } from '../subtitles'
import { buildPrioritizedSubtitleCandidates } from './SubtitleCandidateBuilder'

// ─── Summary Types ───────────────────────────────────────────────────

export interface SubtitleVersionSummary {
  versionCount: number
  activeVersion: {
    id: string
    name: string
    provider?: string
    model?: string
    language?: string
  } | null
  latestSource: {
    provider?: string
    model?: string
    sourceKind?: string
  } | null
}

export interface SubtitleVersionEntry extends FileSubtitle {
  // Enriched at query time — never stored
}

export interface ExportResult {
  ok: boolean
  filename?: string
  blob?: Blob
  failedItems?: Array<{ name: string; reason: string }>
}

interface ZipFileEntry {
  name: string
  bytes: Uint8Array
}

export const IMPORT_SUBTITLE_REASON = {
  IMPORTED: 'imported',
  TRACK_NOT_FOUND: 'track_not_found',
  INVALID_SUBTITLE_CONTENT: 'invalid_subtitle_content',
} as const

export type ImportSubtitleReason =
  (typeof IMPORT_SUBTITLE_REASON)[keyof typeof IMPORT_SUBTITLE_REASON]

export interface ImportSubtitleResult {
  ok: boolean
  reason: ImportSubtitleReason
  fileSubtitleId?: string
}

export const UPSERT_ASR_SUBTITLE_REASON = {
  TRACK_NOT_FOUND: 'track_not_found',
  CREATED: 'created',
  REPLACED: 'replaced',
} as const

export type UpsertAsrSubtitleReason =
  (typeof UPSERT_ASR_SUBTITLE_REASON)[keyof typeof UPSERT_ASR_SUBTITLE_REASON]

export interface UpsertAsrSubtitleResult {
  ok: boolean
  reason: UpsertAsrSubtitleReason
  fileSubtitleId?: string
}

const DEFAULT_EXPORT_FILENAME_SEGMENTS = {
  episodeTitle: 'episode',
  provider: 'unknown-provider',
  model: 'unknown-model',
  manualSubtitle: 'subtitle.srt',
} as const

const MAX_FILENAME_SEGMENT_LENGTH = 80
const SRT_EXTENSION = '.srt'
const VTT_EXTENSION = '.vtt'
const MAX_BUNDLE_EXPORT_BYTES = 400 * 1024 * 1024

function normalizeProviderModelForMatch(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

// ─── Repository ──────────────────────────────────────────────────────

export const DownloadsRepository = {
  async getRestoreSessionByTrackId(trackId: string): Promise<PlaybackSession | undefined> {
    const primarySessionId = `local-track-${trackId}`
    return (
      (await DB.getPlaybackSession(primarySessionId)) ??
      (await DB.findLastSessionByTrackId(trackId))
    )
  },

  async getTrackArtworkBlob(artworkId: string | null | undefined): Promise<Blob | null> {
    if (!artworkId) return null
    const entry = await DB.getAudioBlob(artworkId)
    return entry?.blob ?? null
  },

  getTrackSubtitles(trackId: string): Promise<FileSubtitle[]> {
    return DB.getFileSubtitlesForTrack(trackId)
  },

  /**
   * Get lightweight version summary for a downloaded track.
   * Used by list cards — never loads subtitle content.
   */
  async getSubtitleVersionSummary(trackId: string): Promise<SubtitleVersionSummary> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { versionCount: 0, activeVersion: null, latestSource: null }
    }

    const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()

    if (versions.length === 0) {
      return { versionCount: 0, activeVersion: null, latestSource: null }
    }

    const activeId = download.activeSubtitleId

    const activeEntry = activeId ? versions.find((v) => v.id === activeId) : null

    // Latest by createdAt (descending)
    const sorted = [...versions].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    const latest = sorted[0]

    return {
      versionCount: versions.length,
      activeVersion: activeEntry
        ? {
            id: activeEntry.id,
            name: activeEntry.name,
            provider: activeEntry.provider,
            model: activeEntry.model,
            language: activeEntry.language,
          }
        : null,
      latestSource: latest
        ? {
            provider: latest.provider,
            model: latest.model,
            sourceKind: latest.sourceKind,
          }
        : null,
    }
  },

  /**
   * Get all subtitle versions for a track, sorted by createdAt DESC.
   * Used by the detail sheet — still does not load subtitle content.
   */
  async getSubtitleVersions(trackId: string): Promise<SubtitleVersionEntry[]> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return []
    }

    const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
    return versions.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  },

  /**
   * Set the active subtitle version for a podcast download.
   * MUST be called within a single transaction for atomicity.
   *
   * @param trackId - The podcast download ID
   * @param subtitleId - The local_subtitles.id to activate
   * @param isManual - Whether this is a user-initiated switch (writes manualPinnedAt)
   */
  async setActiveSubtitle(
    trackId: string,
    subtitleId: string,
    isManual: boolean
  ): Promise<boolean> {
    return db.transaction('rw', [db.tracks, db.local_subtitles], async () => {
      const download = await db.tracks.get(trackId)
      if (!isPodcastDownloadTrack(download)) {
        logError('[DownloadsRepo] setActive: download not found or wrong type', trackId)
        return false
      }

      const version = await db.local_subtitles.get(subtitleId)
      if (!version || version.trackId !== trackId) {
        logError('[DownloadsRepo] setActive: version not found or wrong track', {
          subtitleId,
          trackId,
        })
        return false
      }

      if (version.status !== 'ready' && version.status !== undefined) {
        logError('[DownloadsRepo] setActive: cannot activate non-ready version', {
          subtitleId,
          status: version.status,
        })
        return false
      }

      const updates: Partial<PodcastDownload> = { activeSubtitleId: subtitleId }
      if (isManual) {
        updates.manualPinnedAt = Date.now()
      }

      await db.tracks.update(trackId, updates)
      log('[DownloadsRepo] setActive OK', { trackId, subtitleId, isManual })
      return true
    })
  },

  /**
   * Delete a subtitle version. If it was the active version, fall back to the
   * most recent ready version (createdAt DESC). If none remain, clear activeSubtitleId.
   *
   * Reference-protected: does not delete the shared subtitle blob if other
   * local_subtitles entries reference the same subtitleId.
   */
  async deleteSubtitleVersion(trackId: string, fileSubtitleId: string): Promise<boolean> {
    const beforeTrack = await db.tracks.get(trackId)
    const wasActiveVersion =
      isPodcastDownloadTrack(beforeTrack) && beforeTrack.activeSubtitleId === fileSubtitleId

    const deleted = await DB.deleteDownloadSubtitleVersion(trackId, fileSubtitleId)
    if (!deleted) {
      logError('[DownloadsRepo] deleteVersion: download/version not found or mismatched', {
        fileSubtitleId,
        trackId,
      })
      return false
    }

    const updatedTrack = await db.tracks.get(trackId)
    if (wasActiveVersion && isPodcastDownloadTrack(updatedTrack)) {
      log('[DownloadsRepo] deleteVersion: fallback active', {
        trackId,
        fallbackId: updatedTrack.activeSubtitleId,
      })
    }

    log('[DownloadsRepo] deleteVersion OK', { trackId, fileSubtitleId })
    return true
  },

  /**
   * Import a subtitle file content as a new manual subtitle version for a download.
   * Keeps repository boundary: callers should not write local_subtitles directly.
   */
  async importSubtitleVersion(
    trackId: string,
    input: { filename: string; content: string }
  ): Promise<ImportSubtitleResult> {
    const cues = parseSubtitles(input.content)
    if (cues.length === 0) {
      return { ok: false, reason: IMPORT_SUBTITLE_REASON.INVALID_SUBTITLE_CONTENT }
    }

    return db.transaction('rw', [db.tracks, db.local_subtitles, db.subtitles], async () => {
      const download = await db.tracks.get(trackId)
      if (!isPodcastDownloadTrack(download)) {
        logError('[DownloadsRepo] importSubtitleVersion: download not found or wrong type', trackId)
        return { ok: false, reason: IMPORT_SUBTITLE_REASON.TRACK_NOT_FOUND }
      }

      const existing = await db.local_subtitles.where('trackId').equals(trackId).toArray()
      const existingNames = existing.map((sub) => sub.name)
      const versionName = resolveDuplicateName(input.filename, existingNames)

      const subtitleId = await DB.addSubtitle(cues, versionName)
      const fileSubtitleId = await DB.addFileSubtitle({
        trackId,
        name: versionName,
        subtitleId,
        sourceKind: 'manual_upload',
        status: 'ready',
        createdAt: Date.now(),
      })

      return { ok: true, reason: IMPORT_SUBTITLE_REASON.IMPORTED, fileSubtitleId }
    })
  },

  async upsertAsrSubtitleVersion(input: {
    trackId: string
    cues: ASRCue[]
    subtitleName: string
    subtitleFilename: string
    provider: string
    model: string
    fingerprint?: string
    setActive?: boolean
  }): Promise<UpsertAsrSubtitleResult> {
    return db.transaction('rw', [db.tracks, db.local_subtitles, db.subtitles], async () => {
      const track = await db.tracks.get(input.trackId)
      if (!isPodcastDownloadTrack(track)) {
        return { ok: false, reason: UPSERT_ASR_SUBTITLE_REASON.TRACK_NOT_FOUND }
      }

      const providerKey = normalizeProviderModelForMatch(input.provider)
      const modelKey = normalizeProviderModelForMatch(input.model)
      const now = Date.now()

      const allVersions = await db.local_subtitles.where('trackId').equals(input.trackId).toArray()
      const matchedVersion = [...allVersions]
        .filter((version) => {
          if (version.sourceKind === 'manual_upload') return false
          return (
            normalizeProviderModelForMatch(version.provider) === providerKey &&
            normalizeProviderModelForMatch(version.model) === modelKey
          )
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]

      const subtitleId = await DB.addSubtitle(input.cues, input.subtitleFilename, input.fingerprint)

      if (matchedVersion) {
        const oldSubtitleId = matchedVersion.subtitleId

        await db.local_subtitles.update(matchedVersion.id, {
          subtitleId,
          name: input.subtitleName,
          sourceKind: 'asr_online',
          provider: input.provider,
          model: input.model,
          createdAt: now,
          status: 'ready',
        })

        const oldRefCount = await db.local_subtitles
          .where('subtitleId')
          .equals(oldSubtitleId)
          .count()
        if (oldRefCount === 0) {
          await db.subtitles.delete(oldSubtitleId)
        }

        if (input.setActive !== false) {
          await db.tracks.update(input.trackId, {
            activeSubtitleId: matchedVersion.id,
            manualPinnedAt: now,
          } as Partial<PodcastDownload>)
        }

        return {
          ok: true,
          reason: UPSERT_ASR_SUBTITLE_REASON.REPLACED,
          fileSubtitleId: matchedVersion.id,
        }
      }

      const fileSubtitleId = await DB.addFileSubtitle({
        trackId: input.trackId,
        subtitleId,
        name: input.subtitleName,
        sourceKind: 'asr_online',
        provider: input.provider,
        model: input.model,
        createdAt: now,
        status: 'ready',
      })

      if (input.setActive !== false) {
        await db.tracks.update(input.trackId, {
          activeSubtitleId: fileSubtitleId,
          manualPinnedAt: now,
        } as Partial<PodcastDownload>)
      }

      return { ok: true, reason: UPSERT_ASR_SUBTITLE_REASON.CREATED, fileSubtitleId }
    })
  },

  async getTrackSnapshot(trackId: string): Promise<PodcastDownload | undefined> {
    const track = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(track)) return undefined
    return track
  },

  /**
   * Check if a given normalizedUrl already has a downloaded local track.
   */
  async findTrackByUrl(normalizedUrl: string): Promise<PodcastDownload | undefined> {
    if (!normalizedUrl) return undefined
    const results = await db.tracks
      .where('[sourceType+sourceUrlNormalized]')
      .equals([TRACK_SOURCE.PODCAST_DOWNLOAD, normalizedUrl])
      .first()
    return results as PodcastDownload | undefined
  },

  /**
   * Get all downloaded podcast tracks.
   */
  async getAllTracks(): Promise<PodcastDownload[]> {
    return DB.getAllPodcastDownloads()
  },

  /**
   * Remove a downloaded track and its associated blobs.
   * Uses reference-protected cascade cleanup.
   */
  async removeTrack(trackId: string): Promise<boolean> {
    try {
      return await DB.removePodcastDownloadWithCleanup(trackId)
    } catch (err) {
      logError('[DownloadsRepo] Failed to remove track:', err)
      return false
    }
  },

  /**
   * Single source of truth: get available ready subtitles for playback/reading,
   * ordered by priority:
   * 1. The activeSubtitleId (if set and ready)
   * 2. Other ready versions (newest first)
   */
  async getReadySubtitlesByTrackId(
    trackId: string
  ): Promise<Array<{ fileSub: FileSubtitle; subtitle: SubtitleText }>> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return []
    }
    return buildPrioritizedSubtitleCandidates(trackId, download.activeSubtitleId)
  },

  /**
   * Deprecated: Use getReadySubtitlesByTrackId for fallback support.
   */
  async getActiveSubtitleByTrackId(
    trackId: string
  ): Promise<{ fileSub: FileSubtitle; subtitle: SubtitleText } | undefined> {
    const results = await this.getReadySubtitlesByTrackId(trackId)
    return results[0]
  },

  /**
   * Export a single subtitle version as an SRT blob.
   */
  async exportSubtitleVersion(
    trackId: string,
    fileSubtitleId: string,
    episodeTitle: string
  ): Promise<ExportResult> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { ok: false }
    }

    const fileSub = await db.local_subtitles.get(fileSubtitleId)
    if (!fileSub || fileSub.trackId !== trackId) {
      return { ok: false }
    }

    const subtitle = await db.subtitles.get(fileSub.subtitleId)
    if (!subtitle) {
      return { ok: false }
    }

    const exportData = buildSubtitleExportData(fileSub, subtitle, episodeTitle)
    const blob = new Blob([exportData.content], { type: 'text/plain;charset=utf-8' })

    return { ok: true, filename: exportData.filename, blob }
  },

  /**
   * Export all subtitle versions for a track as a zip file.
   * Allows partial success: failed items are reported but don't block export.
   */
  async exportAllSubtitleVersions(trackId: string, episodeTitle: string): Promise<ExportResult> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { ok: false }
    }

    const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
    if (versions.length === 0) {
      return { ok: false }
    }

    // Collect all subtitle content
    const files: ZipFileEntry[] = []
    const failedItems: Array<{ name: string; reason: string }> = []
    const generatedNameCounts = new Map<string, number>()

    for (const version of versions) {
      const subtitle = await db.subtitles.get(version.subtitleId)
      if (!subtitle) {
        failedItems.push({ name: version.name, reason: 'missing_content' })
        continue
      }
      const exportData = buildSubtitleExportData(version, subtitle, episodeTitle)
      const name = getDeterministicUniqueFilename(exportData.filename, generatedNameCounts)
      files.push({ name, bytes: encodeZipText(exportData.content) })
    }

    if (files.length === 0) {
      return { ok: false, failedItems }
    }

    // Build a simple zip using the ZIP format
    const zipBlob = buildSimpleZip(files)
    const filename = `${formatFilenameSegment(episodeTitle, DEFAULT_EXPORT_FILENAME_SEGMENTS.episodeTitle)}.subtitles.zip`

    return { ok: true, filename, blob: zipBlob, failedItems }
  },

  /**
   * Export one downloaded episode bundle as ZIP:
   * - audio file
   * - all subtitle versions for this track
   */
  async exportTrackBundle(trackId: string, episodeTitle: string): Promise<ExportResult> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { ok: false }
    }

    const audioBlob = await db.audioBlobs.get(download.audioId)
    if (!audioBlob) {
      return { ok: false, failedItems: [{ name: 'audio', reason: 'missing_audio_blob' }] }
    }

    // Guard peak memory for current in-memory ZIP assembly.
    // Use the safer upper bound between stored metadata and the actual blob size.
    // TODO(streaming-zip): replace this hard limit with a low-memory streaming ZIP export path.
    const bundleGuardSizeBytes = Math.max(download.sizeBytes ?? 0, audioBlob.blob.size)
    if (bundleGuardSizeBytes > MAX_BUNDLE_EXPORT_BYTES) {
      return { ok: false, failedItems: [{ name: 'bundle', reason: 'bundle_too_large' }] }
    }

    const files: ZipFileEntry[] = []
    const failedItems: Array<{ name: string; reason: string }> = []
    const generatedNameCounts = new Map<string, number>()

    const audioFilename = getDeterministicUniqueFilename(
      resolveAudioBundleFilename(audioBlob.filename, episodeTitle, audioBlob.blob.type),
      generatedNameCounts
    )
    files.push({
      name: audioFilename,
      bytes: await blobToZipBytes(audioBlob.blob),
    })

    const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
    for (const version of versions) {
      const subtitle = await db.subtitles.get(version.subtitleId)
      if (!subtitle) {
        failedItems.push({ name: version.name, reason: 'missing_content' })
        continue
      }
      const exportData = buildSubtitleExportData(version, subtitle, episodeTitle)
      const name = getDeterministicUniqueFilename(exportData.filename, generatedNameCounts)
      files.push({ name, bytes: encodeZipText(exportData.content) })
    }

    const zipBlob = buildSimpleZip(files)
    const filename = `${formatFilenameSegment(episodeTitle, DEFAULT_EXPORT_FILENAME_SEGMENTS.episodeTitle)}.download.zip`
    return { ok: true, filename, blob: zipBlob, failedItems }
  },

  /**
   * Check whether a background ASR task should auto-set active for a track.
   * Returns false if the user has manually pinned a version after the task started.
   */
  async shouldAutoSetActive(trackId: string, taskStartedAt: number): Promise<boolean> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) return false

    // If user manually pinned after this task started, do not overwrite
    if (download.manualPinnedAt && (download.manualPinnedAt || 0) > taskStartedAt) {
      log('[DownloadsRepo] shouldAutoSetActive: blocked by manualPinnedAt', {
        trackId,
        manualPinnedAt: download.manualPinnedAt,
        taskStartedAt,
      })
      return false
    }

    return true
  },

  /**
   * Update a podcast download. Thin wrapper for consistency.
   */
  async updatePodcastDownload(id: string, updates: Partial<PodcastDownload>): Promise<void> {
    const download = await db.tracks.get(id)
    if (!isPodcastDownloadTrack(download)) {
      logError('[DownloadsRepo] update: track not found or wrong type', id)
      return
    }
    return DB.updatePodcastDownload(id, updates)
  },
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function formatFilenameSegment(value: string | undefined, fallback: string): string {
  const sanitized = sanitizeFilenameSegment(value || '').slice(0, MAX_FILENAME_SEGMENT_LENGTH)
  return sanitized || fallback
}

function formatSubtitleExportFilename(input: {
  episodeTitle: string
  provider?: string
  model?: string
  timestampMs: number
}): string {
  const episodeTitle = formatFilenameSegment(
    input.episodeTitle,
    DEFAULT_EXPORT_FILENAME_SEGMENTS.episodeTitle
  )
  const provider = formatFilenameSegment(input.provider, DEFAULT_EXPORT_FILENAME_SEGMENTS.provider)
  const model = formatFilenameSegment(input.model, DEFAULT_EXPORT_FILENAME_SEGMENTS.model)
  const date = formatDateForFilenameUTC(input.timestampMs)
  return `${episodeTitle}.${provider}.${model}.${date}.srt`
}

function formatManualSubtitleExportFilename(name: string | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return DEFAULT_EXPORT_FILENAME_SEGMENTS.manualSubtitle

  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, '-').trim()

  return sanitized || DEFAULT_EXPORT_FILENAME_SEGMENTS.manualSubtitle
}

function resolveAudioBundleFilename(
  filename: string | undefined,
  episodeTitle: string,
  contentType: string
): string {
  const trimmed = filename?.trim() ?? ''
  if (trimmed) {
    const safeFilename = trimUnsafeArchiveFilename(trimmed)
    if (safeFilename) {
      return safeFilename
    }
  }

  const episodeSegment = formatFilenameSegment(
    episodeTitle,
    DEFAULT_EXPORT_FILENAME_SEGMENTS.episodeTitle
  )
  const extension = inferAudioExtension(contentType)
  return `${episodeSegment}${extension}`
}

function inferAudioExtension(contentType: string): string {
  const mime = contentType.trim().toLowerCase()
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3'
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a'
  if (mime.includes('ogg')) return '.ogg'
  if (mime.includes('wav')) return '.wav'
  if (mime.includes('aac')) return '.aac'
  if (mime.includes('flac')) return '.flac'
  return '.audio'
}

function trimUnsafeArchiveFilename(filename: string): string {
  return filename
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveSubtitleExportFilename(fileSub: FileSubtitle, episodeTitle: string): string {
  if (fileSub.sourceKind === 'manual_upload') {
    return formatManualSubtitleExportFilename(fileSub.name)
  }

  return formatSubtitleExportFilename({
    episodeTitle,
    provider: fileSub.provider,
    model: fileSub.model,
    timestampMs: fileSub.createdAt || Date.now(),
  })
}

function resolveDuplicateName(name: string, existingNames: string[]): string {
  const base = name.trim()
  const { stem, extension } = splitFilename(base)
  let finalName = base
  let counter = 2
  const lower = (s: string) => s.trim().toLowerCase()

  while (existingNames.some((n) => lower(n) === lower(finalName))) {
    finalName = `${stem} (${counter})${extension}`
    counter++
  }

  return finalName
}

type SubtitleExportFormat = 'srt' | 'vtt'

function buildSubtitleExportData(
  fileSub: FileSubtitle,
  subtitle: SubtitleText,
  episodeTitle: string
): { filename: string; content: string } {
  const originalFilename = resolveSubtitleExportFilename(fileSub, episodeTitle)
  const format = resolveSubtitleExportFormat(fileSub, originalFilename)
  return {
    filename: normalizeExportFilenameExtension(originalFilename, format),
    content: format === 'vtt' ? cuesToVtt(subtitle.cues) : cuesToSrt(subtitle.cues),
  }
}

function resolveSubtitleExportFormat(
  fileSub: FileSubtitle,
  filename: string
): SubtitleExportFormat {
  if (fileSub.sourceKind !== 'manual_upload') {
    return 'srt'
  }

  return getFilenameExtension(filename) === VTT_EXTENSION ? 'vtt' : 'srt'
}

function normalizeExportFilenameExtension(filename: string, format: SubtitleExportFormat): string {
  const normalized = filename.trim()
  const fallback =
    format === 'vtt' ? `subtitle${VTT_EXTENSION}` : DEFAULT_EXPORT_FILENAME_SEGMENTS.manualSubtitle
  const source = normalized || fallback
  const { stem } = splitFilename(source)
  const extension = format === 'vtt' ? VTT_EXTENSION : SRT_EXTENSION

  return `${stem}${extension}`
}

function encodeZipText(content: string): Uint8Array {
  return new TextEncoder().encode(content)
}

async function blobToZipBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer()
    return new Uint8Array(buffer)
  }

  if (typeof Response !== 'undefined') {
    try {
      const buffer = await new Response(blob as unknown as BodyInit).arrayBuffer()
      return new Uint8Array(buffer)
    } catch {
      // Fall through to FileReader fallback.
    }
  }

  if (typeof FileReader === 'undefined') {
    throw new Error('Blob reader is unavailable')
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const normalizedBlob =
      blob instanceof Blob
        ? blob
        : new Blob([blob as unknown as BlobPart], {
            type: (blob as unknown as { type?: string }).type,
          })
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob bytes'))
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result))
        return
      }
      reject(new Error('Expected ArrayBuffer result when reading blob bytes'))
    }
    reader.readAsArrayBuffer(normalizedBlob)
  })
}

function getFilenameExtension(filename: string): string {
  const { extension } = splitFilename(filename)
  return extension.toLowerCase()
}

function splitFilename(filename: string): { stem: string; extension: string } {
  const normalized = filename.trim()
  const extensionIndex = normalized.lastIndexOf('.')
  if (extensionIndex <= 0 || extensionIndex === normalized.length - 1) {
    return { stem: normalized, extension: '' }
  }

  return {
    stem: normalized.slice(0, extensionIndex),
    extension: normalized.slice(extensionIndex),
  }
}

function getDeterministicUniqueFilename(
  baseFilename: string,
  occurrences: Map<string, number>
): string {
  const key = baseFilename.trim().toLowerCase()
  const nextCount = (occurrences.get(key) ?? 0) + 1
  occurrences.set(key, nextCount)

  if (nextCount === 1) {
    return baseFilename
  }

  const extensionIndex = baseFilename.lastIndexOf('.')
  if (extensionIndex <= 0) {
    return `${baseFilename}-${nextCount}`
  }

  const name = baseFilename.slice(0, extensionIndex)
  const extension = baseFilename.slice(extensionIndex)
  return `${name}-${nextCount}${extension}`
}

// ─── ZIP Helper ──────────────────────────────────────────────────────

/**
 * Build a minimal ZIP file from a list of raw file entries.
 * Uses the ZIP 2.0 format with STORE (no compression) for simplicity.
 */
function buildSimpleZip(files: ZipFileEntry[]): Blob {
  const UTF8_FILENAME_FLAG = 0x0800
  const parts: Uint8Array[] = []
  const centralDir: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encodeZipText(file.name)
    const crc = crc32(file.bytes)

    // Local file header (30 bytes + name + content)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lhView = new DataView(localHeader.buffer)
    lhView.setUint32(0, 0x04034b50, true) // local file header signature
    lhView.setUint16(4, 20, true) // version needed
    // bit11 signals UTF-8 filename/comment encoding for broad unzip compatibility.
    lhView.setUint16(6, UTF8_FILENAME_FLAG, true) // general purpose bit flag
    lhView.setUint16(8, 0, true) // compression: STORE
    lhView.setUint16(10, 0, true) // last mod time
    lhView.setUint16(12, 0, true) // last mod date
    lhView.setUint32(14, crc, true) // crc-32
    lhView.setUint32(18, file.bytes.length, true) // compressed size
    lhView.setUint32(22, file.bytes.length, true) // uncompressed size
    lhView.setUint16(26, nameBytes.length, true) // file name length
    lhView.setUint16(28, 0, true) // extra field length
    localHeader.set(nameBytes, 30)

    parts.push(localHeader, file.bytes)

    // Central directory entry (46 bytes + name)
    const cdEntry = new Uint8Array(46 + nameBytes.length)
    const cdView = new DataView(cdEntry.buffer)
    cdView.setUint32(0, 0x02014b50, true) // central directory signature
    cdView.setUint16(4, 20, true) // version made by
    cdView.setUint16(6, 20, true) // version needed
    cdView.setUint16(8, UTF8_FILENAME_FLAG, true) // general purpose bit flag
    cdView.setUint16(10, 0, true) // compression: STORE
    cdView.setUint16(12, 0, true) // last mod time
    cdView.setUint16(14, 0, true) // last mod date
    cdView.setUint32(16, crc, true) // crc-32
    cdView.setUint32(20, file.bytes.length, true) // compressed size
    cdView.setUint32(24, file.bytes.length, true) // uncompressed size
    cdView.setUint16(28, nameBytes.length, true) // file name length
    cdView.setUint16(30, 0, true) // extra field length
    cdView.setUint16(32, 0, true) // file comment length
    cdView.setUint16(34, 0, true) // disk number start
    cdView.setUint16(36, 0, true) // internal file attributes
    cdView.setUint32(38, 0, true) // external file attributes
    cdView.setUint32(42, offset, true) // relative offset of local header
    cdEntry.set(nameBytes, 46)

    centralDir.push(cdEntry)
    offset += localHeader.length + file.bytes.length
  }

  const cdOffset = offset
  let cdSize = 0
  for (const cd of centralDir) {
    cdSize += cd.length
    parts.push(cd)
  }

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true) // EOCD signature
  eocdView.setUint16(4, 0, true) // disk number
  eocdView.setUint16(6, 0, true) // disk with CD
  eocdView.setUint16(8, files.length, true) // entries on disk
  eocdView.setUint16(10, files.length, true) // total entries
  eocdView.setUint32(12, cdSize, true) // CD size
  eocdView.setUint32(16, cdOffset, true) // CD offset
  eocdView.setUint16(20, 0, true) // comment length
  parts.push(eocd)

  return new Blob(parts as BlobPart[], { type: 'application/zip' })
}

/**
 * Simple CRC-32 implementation for ZIP file generation.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

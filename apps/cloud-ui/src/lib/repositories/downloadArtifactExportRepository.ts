import { blobToZipBytes, buildSimpleZip, type ZipFileEntry } from '../archive/simpleZip'
import { isPodcastDownloadTrack } from '../db/types'
import type { FileSubtitle, SubtitleText } from '../dexieDb'
import { db } from '../dexieDb'
import type { SubtitleExportFormat } from '../subtitles'
import {
  buildSubtitleExportData,
  type DownloadExportResult,
  formatArchiveBaseName,
  getDeterministicUniqueFilename,
  resolveAudioBundleFilename,
} from './downloadExport'
import { DownloadSubtitleRepository } from './downloadSubtitleRepository'

const MAX_BUNDLE_EXPORT_BYTES = 400 * 1024 * 1024

export const DownloadArtifactExportRepository = {
  async exportSubtitleVersion(
    trackId: string,
    fileSubtitleId: string,
    episodeTitle: string,
    format?: SubtitleExportFormat
  ): Promise<DownloadExportResult> {
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

    const exportData = buildSubtitleExportData(fileSub, subtitle, episodeTitle, format)
    const blob = new Blob([exportData.content], { type: exportData.mimeType })
    return { ok: true, filename: exportData.filename, blob }
  },

  async exportActiveTranscriptVersion(
    trackId: string,
    episodeTitle: string,
    format?: SubtitleExportFormat
  ): Promise<DownloadExportResult> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { ok: false }
    }

    const active = (await DownloadSubtitleRepository.getReadySubtitlesByTrackId(trackId))[0]
    if (!active) {
      return { ok: false }
    }

    const exportData = buildSubtitleExportData(
      active.fileSub,
      active.subtitle,
      episodeTitle,
      format
    )
    const blob = new Blob([exportData.content], { type: exportData.mimeType })
    return { ok: true, filename: exportData.filename, blob }
  },

  async exportAudioFile(
    trackId: string,
    fallbackTrackName: string
  ): Promise<DownloadExportResult> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { ok: false }
    }

    const audioBlob = await db.audioBlobs.get(download.audioId)
    if (!audioBlob) {
      return { ok: false }
    }

    return {
      ok: true,
      filename: resolveAudioBundleFilename(
        audioBlob.filename,
        fallbackTrackName,
        audioBlob.blob.type
      ),
      blob: audioBlob.blob,
    }
  },

  async exportAllSubtitleVersions(
    trackId: string,
    episodeTitle: string
  ): Promise<DownloadExportResult> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { ok: false }
    }

    const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
    if (versions.length === 0) {
      return { ok: false }
    }

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
      files.push({ name, bytes: new TextEncoder().encode(exportData.content) })
    }

    if (files.length === 0) {
      return { ok: false, failedItems }
    }

    const zipBlob = buildSimpleZip(files)
    const filename = `${formatArchiveBaseName(episodeTitle, 'episode')}.subtitles.zip`
    return { ok: true, filename, blob: zipBlob, failedItems }
  },

  async exportTrackBundle(
    trackId: string,
    episodeTitle: string
  ): Promise<DownloadExportResult> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { ok: false }
    }

    const audioBlob = await db.audioBlobs.get(download.audioId)
    if (!audioBlob) {
      return { ok: false, failedItems: [{ name: 'audio', reason: 'missing_audio_blob' }] }
    }

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
      files.push({ name, bytes: new TextEncoder().encode(exportData.content) })
    }

    const zipBlob = buildSimpleZip(files)
    const filename = `${formatArchiveBaseName(episodeTitle, 'episode')}.download.zip`
    return { ok: true, filename, blob: zipBlob, failedItems }
  },
}

export type ReadySubtitleCandidate = { fileSub: FileSubtitle; subtitle: SubtitleText }

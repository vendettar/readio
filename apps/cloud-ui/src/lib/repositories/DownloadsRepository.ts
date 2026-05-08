/**
 * Downloads repository facade for downloaded podcast episodes.
 *
 * Responsibilities kept here:
 * - public entry point used by UI/services
 * - download track lookup/persistence/update/remove
 * - delegation to subtitle lifecycle and artifact export subdomains
 *
 * Subtitle invariants are still enforced by the delegated subtitle repository:
 * - active subtitle: at most one per podcast download
 * - fallback on delete: newest ready version
 * - manualPinnedAt protects user choices from background ASR overwrite
 */

import type { ASRCue } from '../asr/types'
import type { PlaybackSession } from '../db/types'
import { isPodcastDownloadTrack, TRACK_SOURCE } from '../db/types'
import type { FileSubtitle, PodcastDownload } from '../dexieDb'
import { DB, db } from '../dexieDb'
import { log, error as logError } from '../logger'
import type { SubtitleExportFormat } from '../subtitles'
import {
  DownloadArtifactExportRepository,
  type ReadySubtitleCandidate,
} from './downloadArtifactExportRepository'
import {
  DownloadSubtitleRepository,
  type ImportSubtitleResult,
  type SubtitleVersionEntry,
  type SubtitleVersionSummary,
  type UpsertAsrSubtitleResult,
  type UpsertBuiltInSubtitleResult,
} from './downloadSubtitleRepository'

export type {
  ImportSubtitleReason,
  ImportSubtitleResult,
  SubtitleVersionEntry,
  SubtitleVersionSummary,
  UpsertAsrSubtitleReason,
  UpsertAsrSubtitleResult,
  UpsertBuiltInSubtitleResult,
} from './downloadSubtitleRepository'
export {
  IMPORT_SUBTITLE_REASON,
  UPSERT_ASR_SUBTITLE_REASON,
} from './downloadSubtitleRepository'

type DownloadSubtitleListener = (trackId: string) => void

const downloadSubtitleListeners = new Set<DownloadSubtitleListener>()

export function subscribeToDownloadSubtitles(listener: DownloadSubtitleListener): () => void {
  downloadSubtitleListeners.add(listener)
  return () => {
    downloadSubtitleListeners.delete(listener)
  }
}

export function emitDownloadSubtitleChange(trackId: string): void {
  for (const listener of downloadSubtitleListeners) {
    listener(trackId)
  }
}

export interface PersistDownloadedEpisodeInput {
  blob: Blob
  filename: string
  normalizedUrl: string
  transcriptUrl?: string
  sourcePodcastTitle: string
  sourceEpisodeTitle: string
  sourceDescription: string
  sourceArtworkUrl: string
  countryAtSave: string
  sourcePodcastItunesId: string
  sourceEpisodeGuid: string
  durationSeconds?: number
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

  searchPodcastDownloadsByName(query: string, limit = 200): Promise<PodcastDownload[]> {
    return DB.searchPodcastDownloadsByName(query, limit)
  },

  /**
   * Get lightweight version summary for a downloaded track.
   * Used by list cards — never loads subtitle content.
   */
  async getSubtitleVersionSummary(trackId: string): Promise<SubtitleVersionSummary> {
    return DownloadSubtitleRepository.getSubtitleVersionSummary(trackId)
  },

  /**
   * Get all subtitle versions for a track, sorted by createdAt DESC.
   * Used by the detail sheet — still does not load subtitle content.
   */
  async getSubtitleVersions(trackId: string): Promise<SubtitleVersionEntry[]> {
    return DownloadSubtitleRepository.getSubtitleVersions(trackId)
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
    const updated = await DownloadSubtitleRepository.setActiveSubtitle(
      trackId,
      subtitleId,
      isManual
    )
    if (updated) {
      emitDownloadSubtitleChange(trackId)
    }
    return updated
  },

  /**
   * Delete a subtitle version. If it was the active version, fall back to the
   * most recent ready version (createdAt DESC). If none remain, clear activeSubtitleId.
   *
   * Reference-protected: does not delete the shared subtitle blob if other
   * local_subtitles entries reference the same subtitleId.
   */
  async deleteSubtitleVersion(trackId: string, fileSubtitleId: string): Promise<boolean> {
    const deleted = await DownloadSubtitleRepository.deleteSubtitleVersion(trackId, fileSubtitleId)
    if (deleted) {
      emitDownloadSubtitleChange(trackId)
    }
    return deleted
  },

  /**
   * Import a subtitle file content as a new manual subtitle version for a download.
   * Keeps repository boundary: callers should not write local_subtitles directly.
   */
  async importSubtitleVersion(
    trackId: string,
    input: { filename: string; content: string }
  ): Promise<ImportSubtitleResult> {
    const result = await DownloadSubtitleRepository.importSubtitleVersion(trackId, input)
    if (result.ok) {
      emitDownloadSubtitleChange(trackId)
    }
    return result
  },

  async upsertBuiltInSubtitleVersion(input: {
    trackId: string
    cues: ASRCue[]
    subtitleName: string
    subtitleFilename: string
    transcriptUrl: string
    setActive?: boolean
  }): Promise<UpsertBuiltInSubtitleResult> {
    const result = await DownloadSubtitleRepository.upsertBuiltInSubtitleVersion(input)
    if (result.ok) {
      emitDownloadSubtitleChange(input.trackId)
    }
    return result
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
    const result = await DownloadSubtitleRepository.upsertAsrSubtitleVersion(input)
    if (result.ok) {
      emitDownloadSubtitleChange(input.trackId)
    }
    return result
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
   * Find a downloaded track by canonical episode identity.
   */
  async findTrackByPodcastAndEpisode(
    podcastItunesId: string,
    episodeGuid: string
  ): Promise<PodcastDownload | undefined> {
    if (!podcastItunesId || !episodeGuid) return undefined
    const results = await db.tracks
      .where('[sourceType+sourcePodcastItunesId+sourceEpisodeGuid]')
      .equals([TRACK_SOURCE.PODCAST_DOWNLOAD, podcastItunesId, episodeGuid])
      .first()
    return results as PodcastDownload | undefined
  },

  async persistDownloadedEpisode(input: PersistDownloadedEpisodeInput): Promise<string> {
    return db.transaction('rw', [db.audioBlobs, db.tracks], async () => {
      const existingTrack = await db.tracks
        .where('[sourceType+sourcePodcastItunesId+sourceEpisodeGuid]')
        .equals([
          TRACK_SOURCE.PODCAST_DOWNLOAD,
          input.sourcePodcastItunesId,
          input.sourceEpisodeGuid,
        ])
        .first()

      if (isPodcastDownloadTrack(existingTrack)) {
        log(
          '[DownloadsRepo] persistDownloadedEpisode: track already exists (concurrency hit)',
          existingTrack.id
        )
        return existingTrack.id
      }

      const audioId = await DB.addAudioBlob(input.blob, input.filename)
      return DB.addPodcastDownload({
        name: input.sourceEpisodeTitle,
        audioId,
        sizeBytes: input.blob.size,
        sourceUrlNormalized: input.normalizedUrl,
        transcriptUrl: input.transcriptUrl,
        sourcePodcastTitle: input.sourcePodcastTitle,
        sourceEpisodeTitle: input.sourceEpisodeTitle,
        sourceDescription: input.sourceDescription,
        sourceArtworkUrl: input.sourceArtworkUrl,
        downloadedAt: Date.now(),
        countryAtSave: input.countryAtSave,
        sourcePodcastItunesId: input.sourcePodcastItunesId,
        sourceEpisodeGuid: input.sourceEpisodeGuid,
        durationSeconds: input.durationSeconds,
      })
    })
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
  async getReadySubtitlesByTrackId(trackId: string): Promise<ReadySubtitleCandidate[]> {
    return DownloadSubtitleRepository.getReadySubtitlesByTrackId(trackId)
  },

  /**
   * Export a single subtitle version as an SRT blob.
   */
  async exportSubtitleVersion(
    trackId: string,
    fileSubtitleId: string,
    episodeTitle: string,
    format?: SubtitleExportFormat
  ) {
    return DownloadArtifactExportRepository.exportSubtitleVersion(
      trackId,
      fileSubtitleId,
      episodeTitle,
      format
    )
  },

  /**
   * Export the active transcript version for a downloaded episode.
   * Falls back to the newest ready subtitle when no explicit active subtitle exists.
   */
  async exportActiveTranscriptVersion(
    trackId: string,
    episodeTitle: string,
    format?: SubtitleExportFormat
  ) {
    return DownloadArtifactExportRepository.exportActiveTranscriptVersion(
      trackId,
      episodeTitle,
      format
    )
  },

  /**
   * Export the audio blob for a downloaded episode track.
   */
  async exportAudioFile(trackId: string, fallbackTrackName: string) {
    return DownloadArtifactExportRepository.exportAudioFile(trackId, fallbackTrackName)
  },

  /**
   * Export all subtitle versions for a track as a zip file.
   * Allows partial success: failed items are reported but don't block export.
   */
  async exportAllSubtitleVersions(trackId: string, episodeTitle: string) {
    return DownloadArtifactExportRepository.exportAllSubtitleVersions(trackId, episodeTitle)
  },

  /**
   * Export one downloaded episode bundle as ZIP:
   * - audio file
   * - all subtitle versions for this track
   */
  async exportTrackBundle(trackId: string, episodeTitle: string) {
    return DownloadArtifactExportRepository.exportTrackBundle(trackId, episodeTitle)
  },

  /**
   * Check whether a background ASR task should auto-set active for a track.
   * Returns false if the user has manually pinned a version after the task started.
   */
  async shouldAutoSetActive(trackId: string, taskStartedAt: number): Promise<boolean> {
    return DownloadSubtitleRepository.shouldAutoSetActive(trackId, taskStartedAt)
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

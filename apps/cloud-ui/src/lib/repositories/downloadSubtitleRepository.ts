import type { ASRCue } from '../asr/types'
import { isPodcastDownloadTrack } from '../db/types'
import type { FileSubtitle, PodcastDownload, SubtitleText } from '../dexieDb'
import { DB, db } from '../dexieDb'
import { log, error as logError } from '../logger'
import { parseSubtitles } from '../subtitles'
import { buildPrioritizedSubtitleCandidates } from './SubtitleCandidateBuilder'
import {
  findLatestAsrSubtitleVersion,
  replaceSubtitleVersionContentAndCleanup,
  resolveDuplicateSubtitleFilename,
  sortSubtitleVersionsNewestFirst,
} from './subtitleVersionShared'

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

export interface UpsertBuiltInSubtitleResult {
  ok: boolean
  reason: 'track_not_found' | 'created' | 'replaced'
  fileSubtitleId?: string
}

export const DownloadSubtitleRepository = {
  async getSubtitleVersionSummary(trackId: string): Promise<SubtitleVersionSummary> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return { versionCount: 0, activeVersion: null, latestSource: null }
    }

    const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
    if (versions.length === 0) {
      return { versionCount: 0, activeVersion: null, latestSource: null }
    }

    const activeEntry = download.activeSubtitleId
      ? versions.find((version) => version.id === download.activeSubtitleId)
      : null
    const latest = sortSubtitleVersionsNewestFirst(versions)[0]

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

  async getSubtitleVersions(trackId: string): Promise<SubtitleVersionEntry[]> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return []
    }

    const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
    return sortSubtitleVersionsNewestFirst(versions)
  },

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
      const versionName = resolveDuplicateSubtitleFilename(
        input.filename,
        existing.map((subtitle) => subtitle.name)
      )

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

  async upsertBuiltInSubtitleVersion(input: {
    trackId: string
    cues: ASRCue[]
    subtitleName: string
    subtitleFilename: string
    transcriptUrl: string
    setActive?: boolean
  }): Promise<UpsertBuiltInSubtitleResult> {
    return db.transaction('rw', [db.tracks, db.local_subtitles, db.subtitles], async () => {
      const track = await db.tracks.get(input.trackId)
      if (!isPodcastDownloadTrack(track)) {
        return { ok: false, reason: 'track_not_found' as const }
      }

      const now = Date.now()
      const existingBuiltIn = sortSubtitleVersionsNewestFirst(
        (await db.local_subtitles.where('trackId').equals(input.trackId).toArray()).filter(
          (version) => version.sourceKind === 'built_in'
        )
      )[0]

      const subtitleId = await DB.addSubtitle(input.cues, input.subtitleFilename)

      if (existingBuiltIn) {
        await replaceSubtitleVersionContentAndCleanup({
          versionId: existingBuiltIn.id,
          oldSubtitleId: existingBuiltIn.subtitleId,
          newSubtitleId: subtitleId,
          patch: {
            name: input.subtitleName,
            sourceKind: 'built_in',
            createdAt: now,
            status: 'ready',
          },
        })

        await db.tracks.update(input.trackId, {
          transcriptUrl: input.transcriptUrl,
          ...(input.setActive !== false ? { activeSubtitleId: existingBuiltIn.id } : {}),
        } as Partial<PodcastDownload>)

        return { ok: true, reason: 'replaced' as const, fileSubtitleId: existingBuiltIn.id }
      }

      const fileSubtitleId = await DB.addFileSubtitle({
        trackId: input.trackId,
        subtitleId,
        name: input.subtitleName,
        sourceKind: 'built_in',
        createdAt: now,
        status: 'ready',
      })

      await db.tracks.update(input.trackId, {
        transcriptUrl: input.transcriptUrl,
        ...(input.setActive !== false ? { activeSubtitleId: fileSubtitleId } : {}),
      } as Partial<PodcastDownload>)

      return { ok: true, reason: 'created' as const, fileSubtitleId }
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

      const now = Date.now()
      const allVersions = await db.local_subtitles.where('trackId').equals(input.trackId).toArray()
      const matchedVersion = findLatestAsrSubtitleVersion(allVersions, input.provider, input.model)
      const subtitleId = await DB.addSubtitle(input.cues, input.subtitleFilename, input.fingerprint)

      if (matchedVersion) {
        await replaceSubtitleVersionContentAndCleanup({
          versionId: matchedVersion.id,
          oldSubtitleId: matchedVersion.subtitleId,
          newSubtitleId: subtitleId,
          patch: {
            name: input.subtitleName,
            sourceKind: 'asr_online',
            provider: input.provider,
            model: input.model,
            createdAt: now,
            status: 'ready',
          },
        })

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

  async getReadySubtitlesByTrackId(
    trackId: string
  ): Promise<Array<{ fileSub: FileSubtitle; subtitle: SubtitleText }>> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) {
      return []
    }
    return buildPrioritizedSubtitleCandidates(trackId, download.activeSubtitleId)
  },

  async shouldAutoSetActive(trackId: string, taskStartedAt: number): Promise<boolean> {
    const download = await db.tracks.get(trackId)
    if (!isPodcastDownloadTrack(download)) return false

    if (download.manualPinnedAt && download.manualPinnedAt > taskStartedAt) {
      log('[DownloadsRepo] shouldAutoSetActive: blocked by manualPinnedAt', {
        trackId,
        manualPinnedAt: download.manualPinnedAt,
        taskStartedAt,
      })
      return false
    }

    return true
  },
}

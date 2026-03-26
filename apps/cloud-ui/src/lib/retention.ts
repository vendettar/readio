import { isUserUploadTrack } from './db/types'
import { DB, DB_TABLE_NAMES } from './dexieDb'
import { isSubtitleOrphaned, isTrackFolderOrphaned } from './integrity'
import { log, error as logError } from './logger'
import { FilesRepository } from './repositories/FilesRepository'
import { PlaybackRepository } from './repositories/PlaybackRepository'

/**
 * Retention Policy constants
 */
const MAX_SESSIONS = 1000
const RETENTION_DAYS = 180 // 6 months
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

export interface IntegrityCheckReport {
  checkedAt: number
  missingAudioBlob: number
  danglingFolderRef: number
  danglingTrackRef: number
  totalRepairs: number
}

/**
 * Automatically prunes playback history to prevent unbounded IndexedDB growth.
 * Policy: Keep the most recent 1000 sessions OR last 6 months, whichever is smaller.
 */
export async function prunePlaybackHistory(): Promise<void> {
  const now = Date.now()
  const timeCutoff = now - RETENTION_MS

  try {
    const countCutoff = await PlaybackRepository.getPlaybackSessionCutoff(MAX_SESSIONS)

    // The effective cutoff is the MORE RECENT (larger) of the two limits.
    const effectiveCutoff = Math.max(timeCutoff, countCutoff)

    // Identify and delete sessions below the effective cutoff
    const deleteIds = await PlaybackRepository.getOldPlaybackSessionIds(effectiveCutoff)

    if (deleteIds.length > 0) {
      log(
        `[Retention] Pruning ${deleteIds.length} sessions (Effective Limit: ${new Date(
          effectiveCutoff
        ).toISOString()})`
      )
      await deleteSessionsInBatches(deleteIds)
    }
  } catch (err) {
    logError('[Retention] Maintenance failed:', err)
  }
}

/**
 * Deletes session IDs in batches to avoid blocking the IndexedDB / UI thread.
 */
async function deleteSessionsInBatches(ids: string[], batchSize = 100): Promise<void> {
  const total = ids.length
  for (let i = 0; i < total; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    await PlaybackRepository.deletePlaybackSessionsBulk(batch)
    // Small delay between batches to allow UI thread to breathe
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
}

/**
 * Checks for data consistency issues and performs self-healing.
 *
 * Checks:
 * 1. Missing Audio Blobs -> Mark track as corrupted
 * 2. Dangling Folder References -> Move track to root
 * 3. Dangling Subtitle References -> Delete local_subtitle record
 */
export async function runIntegrityCheck(): Promise<IntegrityCheckReport> {
  const checkedAt = Date.now()
  const stats = {
    missingAudioBlob: 0,
    danglingFolderRef: 0,
    danglingTrackRef: 0,
  }

  try {
    // Read phase: build a repair plan using set comparisons
    const folderIds = new Set(await FilesRepository.getAllFolderIds())
    const audioBlobIds = new Set(await PlaybackRepository.getAllAudioBlobIds())
    const trackIds = new Set(await FilesRepository.getAllTrackIds())

    const trackRepairPlan = new Map<
      string,
      {
        isCorrupted?: boolean
        folderId?: null
      }
    >()

    await FilesRepository.iterateAllTracks((track) => {
      const nextPatch: { isCorrupted?: boolean; folderId?: null } = {}

      if (!audioBlobIds.has(track.audioId) && !track.isCorrupted) {
        logError(
          `[Integrity] Track "${track.name}" is missing its audio blob. Marking as corrupted.`
        )
        nextPatch.isCorrupted = true
      }

      if (isUserUploadTrack(track) && isTrackFolderOrphaned(track.folderId, folderIds)) {
        logError(
          `[Integrity] Track "${track.name}" has missing folder ${track.folderId}. Moving to root.`
        )
        nextPatch.folderId = null
      }

      if (Object.keys(nextPatch).length > 0) {
        trackRepairPlan.set(track.id, nextPatch)
      }
    })

    const danglingSubtitleIds: string[] = []
    await FilesRepository.iterateAllLocalSubtitles((sub) => {
      if (isSubtitleOrphaned(sub.trackId, trackIds)) {
        logError(`[Integrity] Subtitle ${sub.id} points to missing track ${sub.trackId}. Deleting.`)
        danglingSubtitleIds.push(sub.id)
      }
    })

    await applyTrackRepairsInBatches(trackRepairPlan, stats)
    await deleteDanglingSubtitlesInBatches(danglingSubtitleIds, stats)
  } catch (err) {
    logError('[Integrity] Check failed:', err)
    throw err
  }

  if (Object.values(stats).some((v) => v > 0)) {
    log(`[Integrity] Scan complete. Repairs: ${JSON.stringify(stats)}`)
  }

  const totalRepairs = stats.missingAudioBlob + stats.danglingFolderRef + stats.danglingTrackRef

  return {
    checkedAt,
    missingAudioBlob: stats.missingAudioBlob,
    danglingFolderRef: stats.danglingFolderRef,
    danglingTrackRef: stats.danglingTrackRef,
    totalRepairs,
  }
}

const INTEGRITY_WRITE_BATCH_SIZE = 100

async function applyTrackRepairsInBatches(
  plans: Map<string, { isCorrupted?: boolean; folderId?: null }>,
  stats: { missingAudioBlob: number; danglingFolderRef: number; danglingTrackRef: number }
): Promise<void> {
  const entries = Array.from(plans.entries())
  for (let i = 0; i < entries.length; i += INTEGRITY_WRITE_BATCH_SIZE) {
    const batch = entries.slice(i, i + INTEGRITY_WRITE_BATCH_SIZE)

    // Execute batch update within a single transaction
    await DB.transaction('rw', [DB_TABLE_NAMES.TRACKS], async () => {
      for (const [trackId, patch] of batch) {
        // Use unified track patch API to handle cross-sourceType repairs
        const success = await DB.updateTrackPatch(trackId, patch)
        if (!success) continue

        if (patch.isCorrupted) stats.missingAudioBlob++
        if (patch.folderId === null) stats.danglingFolderRef++
      }
    })
  }
}

async function deleteDanglingSubtitlesInBatches(
  subtitleIds: string[],
  stats: { missingAudioBlob: number; danglingFolderRef: number; danglingTrackRef: number }
): Promise<void> {
  for (let i = 0; i < subtitleIds.length; i += INTEGRITY_WRITE_BATCH_SIZE) {
    const batch = subtitleIds.slice(i, i + INTEGRITY_WRITE_BATCH_SIZE)
    const deleted = await FilesRepository.deleteLocalSubtitlesBulk(batch)
    stats.danglingTrackRef += deleted
  }
}

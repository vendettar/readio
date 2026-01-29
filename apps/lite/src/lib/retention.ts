import { db } from './dexieDb'
import { log, error as logError } from './logger'

/**
 * Retention Policy constants
 */
const MAX_SESSIONS = 1000
const RETENTION_DAYS = 180 // 6 months
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

/**
 * Automatically prunes playback history to prevent unbounded IndexedDB growth.
 * Policy: Keep the most recent 1000 sessions OR last 6 months, whichever is smaller.
 * (This means the more restrictive limit is applied: we calculate the cutoff for both
 * and use the most recent one).
 */
export async function prunePlaybackHistory(): Promise<void> {
  const now = Date.now()
  const timeCutoff = now - RETENTION_MS

  try {
    // 1. Get the lastPlayedAt timestamp of the 1000th newest item
    const thousandthItem = await db.playback_sessions
      .orderBy('lastPlayedAt')
      .reverse()
      .offset(MAX_SESSIONS - 1)
      .first()

    const countCutoff = thousandthItem?.lastPlayedAt ?? 0

    // 2. The effective cutoff is the MORE RECENT (larger) of the two limits.
    // Examples:
    // - If we have 2000 items within 6mo: countCutoff is newer than timeCutoff. Use countCutoff.
    // - If we have 500 items within 6mo: timeCutoff is newer than countCutoff. Use timeCutoff.
    const effectiveCutoff = Math.max(timeCutoff, countCutoff)

    // 3. Identify and delete sessions below the effective cutoff in one batch flow
    const deleteIds = await db.playback_sessions
      .where('lastPlayedAt')
      .below(effectiveCutoff)
      .primaryKeys()

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
    await db.playback_sessions.bulkDelete(batch)
    // Small delay between batches to allow UI thread to breathe
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
}

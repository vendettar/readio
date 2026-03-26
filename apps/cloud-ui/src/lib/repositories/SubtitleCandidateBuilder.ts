import type { FileSubtitle, SubtitleText } from '../db/types'
import { db } from '../dexieDb'

/**
 * Shared utility to build prioritized subtitle candidates for a track.
 * Logic:
 * 1. The activeSubtitleId (if set and ready)
 * 2. Other ready versions (newest first)
 *
 * Optimized with bulkGet to avoid N+1 queries.
 */
export async function buildPrioritizedSubtitleCandidates(
  trackId: string,
  activeSubtitleId?: string | null
): Promise<Array<{ fileSub: FileSubtitle; subtitle: SubtitleText }>> {
  const candidates: Array<{ fileSub: FileSubtitle; subtitle: SubtitleText }> = []
  const seenFileSubtitleIds = new Set<string>()

  // 1. Fetch all local subtitle records for this track
  const allLocalSubs = await db.local_subtitles.where('trackId').equals(trackId).toArray()

  if (allLocalSubs.length === 0) return []

  // 2. Identify "ready" candidates
  const readyLocalSubs = allLocalSubs.filter((s) => s.status === 'ready' || s.status === undefined)

  if (readyLocalSubs.length === 0) return []

  // 3. Handle active subtitle priority
  let firstCandidate: FileSubtitle | undefined
  if (activeSubtitleId) {
    firstCandidate = readyLocalSubs.find((s) => s.id === activeSubtitleId)
    if (firstCandidate) {
      seenFileSubtitleIds.add(firstCandidate.id)
    }
  }

  // 4. Sort remaining by newest first
  const remainingSorted = readyLocalSubs
    .filter((s) => !seenFileSubtitleIds.has(s.id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  // 5. Batch fetch the actual SubtitleText entities
  const orderedFileSubs = firstCandidate ? [firstCandidate, ...remainingSorted] : remainingSorted

  const subtitleIds = orderedFileSubs.map((s) => s.subtitleId)
  const subtitleTexts = await db.subtitles.bulkGet(subtitleIds)

  // 6. Map back to pairs, filtering out any missing entities
  for (let i = 0; i < orderedFileSubs.length; i++) {
    const fileSub = orderedFileSubs[i]
    const subtitle = subtitleTexts[i]
    if (subtitle) {
      candidates.push({ fileSub, subtitle })
    }
  }

  return candidates
}

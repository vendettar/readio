import { DB, db } from '../dexieDb'

export interface TrackRepairPatch {
  trackId: string
  patch: { isCorrupted?: boolean; folderId?: null }
}

export const MaintenanceRepository = {
  async applyTrackRepairs(batch: TrackRepairPatch[]): Promise<string[]> {
    if (batch.length === 0) return []

    const repairedTrackIds: string[] = []
    await db.transaction('rw', [db.tracks], async () => {
      for (const entry of batch) {
        const updated = await DB.updateTrackPatch(entry.trackId, entry.patch)
        if (updated) {
          repairedTrackIds.push(entry.trackId)
        }
      }
    })

    return repairedTrackIds
  },
}

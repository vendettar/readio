import type { ReadioDB } from './schema'
import type { RemoteTranscriptCache } from './types'

export function createRemoteTranscriptDbMethods(db: ReadioDB) {
  return {
    async upsertRemoteTranscript(
      data: Omit<RemoteTranscriptCache, 'id' | 'fetchedAt'> & {
        id: string
        fetchedAt?: number
      }
    ): Promise<string> {
      const record: RemoteTranscriptCache = {
        ...data,
        fetchedAt: data.fetchedAt ?? Date.now(),
        cueSchemaVersion: data.cueSchemaVersion ?? 1,
      }
      await db.remote_transcripts.put(record)
      return record.id
    },

    async getRemoteTranscriptById(id: string): Promise<RemoteTranscriptCache | undefined> {
      return db.remote_transcripts.get(id)
    },

    async getRemoteTranscriptByUrl(url: string): Promise<RemoteTranscriptCache | undefined> {
      return db.remote_transcripts.where('url').equals(url).first()
    },

    async findRemoteTranscriptByFingerprint(
      fingerprint: string
    ): Promise<RemoteTranscriptCache | undefined> {
      if (!fingerprint) return undefined
      return db.remote_transcripts.where('asrFingerprint').equals(fingerprint).first()
    },

    async getAllRemoteTranscripts(): Promise<RemoteTranscriptCache[]> {
      return db.remote_transcripts.orderBy('fetchedAt').reverse().toArray()
    },

    async deleteRemoteTranscriptById(id: string): Promise<void> {
      await db.remote_transcripts.delete(id)
    },

    async clearRemoteTranscripts(): Promise<void> {
      await db.remote_transcripts.clear()
    },

    async pruneRemoteTranscripts(maxEntries: number, maxAgeMs: number): Promise<void> {
      const now = Date.now()
      const deleteIdSet = new Set<string>()

      if (maxAgeMs > 0) {
        const staleIds = await db.remote_transcripts
          .where('fetchedAt')
          .below(now - maxAgeMs)
          .primaryKeys()
        for (const id of staleIds) {
          if (typeof id === 'string') {
            deleteIdSet.add(id)
          }
        }
      }

      if (maxEntries > 0) {
        const total = await db.remote_transcripts.count()
        const excess = total - maxEntries
        if (excess > 0) {
          const oldestIds = await db.remote_transcripts
            .orderBy('fetchedAt')
            .limit(excess)
            .primaryKeys()
          for (const id of oldestIds) {
            if (typeof id === 'string') {
              deleteIdSet.add(id)
            }
          }
        }
      }

      if (deleteIdSet.size > 0) {
        await db.remote_transcripts.bulkDelete([...deleteIdSet])
      }
    },
  }
}

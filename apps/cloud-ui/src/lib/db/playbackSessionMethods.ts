import Dexie from 'dexie'

import { buildPlaybackSessionRecord, normalizePlaybackSessionRecord } from './recordNormalizers'
import type { ReadioDB } from './schema'
import type {
  PlaybackSession,
  PlaybackSessionCreateInput,
  PlaybackSessionUpdatePatch,
} from './types'

interface AudioBlobReferenceCounts {
  referencedBySession: number
  referencedByTrackAudio: number
  referencedByTrackArtwork: number
}

type GetAudioBlobReferenceCounts = (audioId: string) => Promise<AudioBlobReferenceCounts>

export function createPlaybackSessionDbMethods(
  db: ReadioDB,
  generateId: () => string,
  getAudioBlobReferenceCounts: GetAudioBlobReferenceCounts
) {
  return {
    async createPlaybackSession(data: PlaybackSessionCreateInput): Promise<string> {
      const item = buildPlaybackSessionRecord(data)
      await db.playback_sessions.put(item)
      return item.id
    },

    async upsertPlaybackSession(data: PlaybackSessionCreateInput): Promise<string> {
      const id = data.id || generateId()
      const existing = await db.playback_sessions.get(id)

      if (existing) {
        const merged = {
          ...existing,
          ...data,
          id,
          progress: data.progress !== undefined ? data.progress : existing.progress,
          durationSeconds:
            data.durationSeconds !== undefined ? data.durationSeconds : existing.durationSeconds,
          lastPlayedAt: data.lastPlayedAt !== undefined ? data.lastPlayedAt : existing.lastPlayedAt,
        }
        const updated = normalizePlaybackSessionRecord(
          merged as PlaybackSession,
          'playback session'
        )
        await db.playback_sessions.put(updated)
        return id
      }

      const item = buildPlaybackSessionRecord({ ...data, id })
      await db.playback_sessions.put(item)
      return item.id
    },

    async updatePlaybackSession(id: string, updates: PlaybackSessionUpdatePatch): Promise<void> {
      const existing = await db.playback_sessions.get(id)
      if (!existing) {
        throw new Error(`Playback session ${id} not found`)
      }
      const merged = {
        ...existing,
        ...updates,
        lastPlayedAt: updates.lastPlayedAt ?? existing.lastPlayedAt,
      }
      const updated = normalizePlaybackSessionRecord(merged as PlaybackSession, 'playback session')
      await db.playback_sessions.put(updated)
    },

    async getPlaybackSession(id: string): Promise<PlaybackSession | undefined> {
      return db.playback_sessions.get(id)
    },

    async getLastPlaybackSession(): Promise<PlaybackSession | undefined> {
      return db.playback_sessions.orderBy('lastPlayedAt').reverse().first()
    },

    async getAllPlaybackSessions(): Promise<PlaybackSession[]> {
      return db.playback_sessions.orderBy('lastPlayedAt').reverse().toArray()
    },

    async getPlaybackSessionsByEpisodeGuid(episodeGuid: string): Promise<PlaybackSession[]> {
      if (!episodeGuid) return []
      return db.playback_sessions.where('episodeGuid').equals(episodeGuid).toArray()
    },

    async getPlaybackSessionsByAudioUrl(audioUrl: string): Promise<PlaybackSession[]> {
      if (!audioUrl) return []
      return db.playback_sessions.where('audioUrl').equals(audioUrl).toArray()
    },

    async searchPlaybackSessionsByTitle(query: string, limit = 200): Promise<PlaybackSession[]> {
      if (!query) return []
      return db.playback_sessions.where('title').startsWithIgnoreCase(query).limit(limit).toArray()
    },

    async searchSessionsByAudioUrls(urls: string[]): Promise<PlaybackSession[]> {
      if (!urls.length) return []
      return db.playback_sessions.where('audioUrl').anyOf(urls).toArray()
    },

    async searchExploreSessionsByCanonicalEpisodes(
      identities: Array<{ podcastItunesId: string; episodeGuid: string }>
    ): Promise<PlaybackSession[]> {
      if (!identities.length) return []
      const keys = identities
        .map(
          ({ podcastItunesId, episodeGuid }) => [podcastItunesId, episodeGuid] as [string, string]
        )
        .filter(([podcastItunesId, episodeGuid]) => !!podcastItunesId && !!episodeGuid)
      if (!keys.length) return []
      return db.playback_sessions.where('[podcastItunesId+episodeGuid]').anyOf(keys).toArray()
    },

    async getPlaybackSessionsByShortGuid(shortId: string): Promise<PlaybackSession[]> {
      return db.playback_sessions
        .where('episodeGuid')
        .startsWithIgnoreCase(shortId)
        .limit(5)
        .toArray()
    },

    async iterateAllPlaybackSessions(
      callback: (session: PlaybackSession) => void | Promise<void>
    ): Promise<void> {
      await db.playback_sessions.toCollection().each(callback)
    },

    async findLastSessionByUrl(audioUrl: string): Promise<PlaybackSession | undefined> {
      if (!audioUrl) return undefined
      return db.playback_sessions
        .where('[audioUrl+lastPlayedAt]')
        .between([audioUrl, Dexie.minKey], [audioUrl, Dexie.maxKey])
        .last()
    },

    async findLastExploreSessionByCanonicalIdentity(
      podcastItunesId: string,
      episodeGuid: string
    ): Promise<PlaybackSession | undefined> {
      if (!podcastItunesId || !episodeGuid) return undefined
      const sessions = await db.playback_sessions
        .where('[podcastItunesId+episodeGuid]')
        .equals([podcastItunesId, episodeGuid])
        .filter((session) => session.source === 'explore')
        .toArray()
      return sessions.reduce<PlaybackSession | undefined>(
        (latest, session) =>
          !latest || session.lastPlayedAt > latest.lastPlayedAt ? session : latest,
        undefined
      )
    },

    async findLastSessionByTrackId(trackId: string): Promise<PlaybackSession | undefined> {
      if (!trackId) return undefined
      return db.playback_sessions
        .where('[localTrackId+lastPlayedAt]')
        .between([trackId, Dexie.minKey], [trackId, Dexie.maxKey])
        .last()
    },

    async getPlaybackSessionCutoff(limit: number): Promise<number> {
      const item = await db.playback_sessions
        .orderBy('lastPlayedAt')
        .reverse()
        .offset(limit - 1)
        .first()
      return item?.lastPlayedAt ?? 0
    },

    async getOldPlaybackSessionIds(cutoff: number): Promise<string[]> {
      const ids = await db.playback_sessions.where('lastPlayedAt').below(cutoff).primaryKeys()
      return ids as string[]
    },

    async deletePlaybackSessionsBulk(ids: string[]): Promise<number> {
      if (ids.length === 0) return 0
      await db.playback_sessions.bulkDelete(ids)
      return ids.length
    },

    async deletePlaybackSession(id: string): Promise<void> {
      await db.playback_sessions.delete(id)
    },

    async clearPlaybackSessionAudioCache(id: string): Promise<boolean> {
      return db.transaction('rw', [db.playback_sessions, db.audioBlobs, db.tracks], async () => {
        const session = await db.playback_sessions.get(id)
        if (!session?.audioId) return false

        const audioId = session.audioId
        await db.playback_sessions.update(id, {
          audioId: null,
          hasAudioBlob: false,
        })

        const refs = await getAudioBlobReferenceCounts(audioId)
        if (
          refs.referencedBySession === 0 &&
          refs.referencedByTrackAudio === 0 &&
          refs.referencedByTrackArtwork === 0
        ) {
          await db.audioBlobs.delete(audioId)
        }

        return true
      })
    },
  }
}

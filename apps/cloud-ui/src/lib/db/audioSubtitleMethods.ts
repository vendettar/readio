import type { ASRCue } from '../asr/types'
import { warn } from '../logger'

import type { ReadioDB } from './schema'
import type { AudioBlob, SubtitleText } from './types'

interface AudioBlobReferenceCounts {
  referencedBySession: number
  referencedByTrackAudio: number
  referencedByTrackArtwork: number
}

type GetAudioBlobReferenceCounts = (audioId: string) => Promise<AudioBlobReferenceCounts>

export function createAudioSubtitleDbMethods(
  db: ReadioDB,
  generateId: () => string,
  getAudioBlobReferenceCounts: GetAudioBlobReferenceCounts
) {
  return {
    async getAllAudioBlobIds(): Promise<string[]> {
      const ids = await db.audioBlobs.toCollection().primaryKeys()
      return ids as string[]
    },

    async addAudioBlob(blob: Blob, filename: string): Promise<string> {
      const id = generateId()
      const audioBlob: AudioBlob = {
        id,
        blob,
        size: blob.size,
        type: blob.type,
        filename,
        storedAt: Date.now(),
      }
      await db.audioBlobs.put(audioBlob)
      return id
    },

    async getAudioBlob(id: string): Promise<AudioBlob | undefined> {
      return db.audioBlobs.get(id)
    },

    async getAllAudioBlobs(): Promise<AudioBlob[]> {
      return db.audioBlobs.orderBy('storedAt').reverse().toArray()
    },

    async deleteAudioBlob(id: string): Promise<void> {
      await db.transaction('rw', [db.audioBlobs, db.playback_sessions, db.tracks], async () => {
        const { referencedBySession, referencedByTrackAudio, referencedByTrackArtwork } =
          await getAudioBlobReferenceCounts(id)

        if (referencedBySession > 0 || referencedByTrackAudio > 0 || referencedByTrackArtwork > 0) {
          if (import.meta.env.DEV) {
            warn('[DB] deleteAudioBlob blocked by active references', {
              id,
              referencedBySession,
              referencedByTrackAudio,
              referencedByTrackArtwork,
            })
          }
          return
        }

        await db.audioBlobs.delete(id)
      })
    },

    async deleteAudioBlobsBulk(ids: string[]): Promise<number> {
      if (ids.length === 0) return 0
      await db.audioBlobs.bulkDelete(ids)
      return ids.length
    },

    async clearAllAudioBlobs(): Promise<void> {
      const allBlobs = await db.audioBlobs.toArray()
      if (allBlobs.length === 0) return

      const deletedBlobIds = new Set<string>(allBlobs.map((blob) => blob.id))

      await db.transaction('rw', [db.audioBlobs, db.playback_sessions, db.tracks], async () => {
        await db.audioBlobs.clear()

        const sessions = await db.playback_sessions.toArray()
        for (const session of sessions) {
          const lostAudio = !!session.audioId && deletedBlobIds.has(session.audioId)
          if (!lostAudio && !session.hasAudioBlob) continue

          await db.playback_sessions.put({
            ...session,
            audioId: null,
            hasAudioBlob: false,
          })
        }

        await db.tracks.toCollection().modify((track) => {
          const lostAudio = deletedBlobIds.has(track.audioId)
          const lostArtwork = !!track.artworkId && deletedBlobIds.has(track.artworkId)
          if (lostAudio || lostArtwork) {
            track.isCorrupted = true
          }
        })
      })
    },

    async addSubtitle(cues: ASRCue[], filename: string, asrFingerprint?: string): Promise<string> {
      const id = generateId()
      const subtitle: SubtitleText = {
        id,
        cues,
        cueSchemaVersion: 1,
        asrFingerprint,
        size: new Blob([JSON.stringify(cues)]).size,
        filename,
        storedAt: Date.now(),
      }
      await db.subtitles.put(subtitle)
      return id
    },

    async findSubtitleByFingerprint(fingerprint: string): Promise<SubtitleText | undefined> {
      if (!fingerprint) return undefined
      return db.subtitles.where('asrFingerprint').equals(fingerprint).first()
    },

    async getSubtitle(id: string): Promise<SubtitleText | undefined> {
      return db.subtitles.get(id)
    },

    async getAllSubtitles(): Promise<SubtitleText[]> {
      return db.subtitles.orderBy('storedAt').reverse().toArray()
    },

    async deleteSubtitle(id: string): Promise<void> {
      await db.transaction('rw', [db.subtitles, db.local_subtitles], async () => {
        const refCount = await db.local_subtitles.where('subtitleId').equals(id).count()
        if (refCount > 0) {
          if (import.meta.env.DEV) {
            warn('[DB] deleteSubtitle blocked by active references', { id, refCount })
          }
          return
        }
        await db.subtitles.delete(id)
      })
    },
  }
}

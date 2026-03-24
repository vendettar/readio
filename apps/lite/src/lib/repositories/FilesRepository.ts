import type { ASRCue } from '../asr/types'
import { isUserUploadTrack } from '../db/types'
import type {
  AudioBlob,
  FileFolder,
  FileSubtitle,
  FileTrack,
  Setting,
  SubtitleText,
  Track,
} from '../dexieDb'
import { DB, db } from '../dexieDb'
import { buildPrioritizedSubtitleCandidates } from './SubtitleCandidateBuilder'

export const UPSERT_FILE_ASR_SUBTITLE_REASON = {
  TRACK_NOT_FOUND: 'track_not_found',
  CREATED: 'created',
  REPLACED: 'replaced',
} as const

export type UpsertFileAsrSubtitleReason =
  (typeof UPSERT_FILE_ASR_SUBTITLE_REASON)[keyof typeof UPSERT_FILE_ASR_SUBTITLE_REASON]

export interface UpsertFileAsrSubtitleResult {
  ok: boolean
  reason: UpsertFileAsrSubtitleReason
  fileSubtitleId?: string
}

function normalizeProviderModelForMatch(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export const FilesRepository = {
  getAllFolders(): Promise<FileFolder[]> {
    return DB.getAllFolders()
  },

  getAllFileTracks(): Promise<FileTrack[]> {
    return DB.getAllFileTracks()
  },

  getFileTracksInFolder(folderId: string): Promise<FileTrack[]> {
    return DB.getFileTracksInFolder(folderId)
  },

  getFolder(id: string): Promise<FileFolder | undefined> {
    return DB.getFolder(id)
  },

  getAllFolderIds(): Promise<string[]> {
    return DB.getAllFolderIds()
  },

  getAudioBlob(id: string): Promise<AudioBlob | undefined> {
    return DB.getAudioBlob(id)
  },

  getAllAudioBlobIds(): Promise<string[]> {
    return DB.getAllAudioBlobIds()
  },

  getTrackById(id: string): Promise<Track | undefined> {
    return db.tracks.get(id)
  },

  getAllTrackIds(): Promise<string[]> {
    return DB.getAllTrackIds()
  },

  iterateAllTracks(callback: (track: Track) => void | Promise<void>): Promise<void> {
    return DB.iterateAllTracks(callback)
  },

  /**
   * Resolve artwork blob for a track by its ID.
   */
  async resolveTrackArtwork(trackId: string): Promise<Blob | null> {
    const track = await db.tracks.get(trackId)
    if (track?.artworkId) {
      const audioBlob = await DB.getAudioBlob(track.artworkId)
      return audioBlob?.blob || null
    }
    return null
  },

  getSetting(key: string): Promise<Setting['value'] | null> {
    return DB.getSetting(key)
  },

  setSetting(key: string, value: string): Promise<void> {
    return DB.setSetting(key, value)
  },

  getFileSubtitlesForTrack(trackId: string): Promise<FileSubtitle[]> {
    return DB.getFileSubtitlesForTrack(trackId)
  },

  iterateAllLocalSubtitles(callback: (sub: FileSubtitle) => void | Promise<void>): Promise<void> {
    return DB.iterateAllLocalSubtitles(callback)
  },

  deleteLocalSubtitlesBulk(ids: string[]): Promise<number> {
    return DB.deleteLocalSubtitlesBulk(ids)
  },

  /**
   * Single source of truth: get available ready subtitles for playback/reading,
   * ordered by priority:
   * 1. The activeSubtitleId (if set and ready)
   * 2. Other ready versions (newest first)
   */
  async getReadySubtitlesByTrackId(
    trackId: string
  ): Promise<Array<{ fileSub: FileSubtitle; subtitle: SubtitleText }>> {
    const fileTrack = await db.tracks.get(trackId)
    if (!isUserUploadTrack(fileTrack)) {
      return []
    }
    return buildPrioritizedSubtitleCandidates(trackId, fileTrack.activeSubtitleId)
  },

  /**
   * Deprecated: Use getReadySubtitlesByTrackId for fallback support.
   */
  async getActiveSubtitleByTrackId(
    trackId: string
  ): Promise<{ fileSub: FileSubtitle; subtitle: SubtitleText } | undefined> {
    const results = await this.getReadySubtitlesByTrackId(trackId)
    return results[0]
  },

  updateFolder(id: string, updates: Partial<Pick<FileFolder, 'name' | 'pinnedAt'>>): Promise<void> {
    return DB.updateFolder(id, updates)
  },

  updateFileTrack(id: string, updates: Partial<FileTrack>): Promise<void> {
    return DB.updateFileTrack(id, updates)
  },

  deleteFileTrack(id: string): Promise<void> {
    return DB.deleteFileTrack(id)
  },

  deleteFileSubtitle(id: string): Promise<void> {
    return DB.deleteFileSubtitle(id)
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
  }): Promise<UpsertFileAsrSubtitleResult> {
    return db.transaction('rw', [db.tracks, db.local_subtitles, db.subtitles], async () => {
      const track = await db.tracks.get(input.trackId)
      if (!isUserUploadTrack(track)) {
        return { ok: false, reason: UPSERT_FILE_ASR_SUBTITLE_REASON.TRACK_NOT_FOUND }
      }

      const providerKey = normalizeProviderModelForMatch(input.provider)
      const modelKey = normalizeProviderModelForMatch(input.model)
      const now = Date.now()

      const allVersions = await db.local_subtitles.where('trackId').equals(input.trackId).toArray()
      const matchedVersion = [...allVersions]
        .filter((version) => {
          if (version.sourceKind === 'manual_upload') return false
          return (
            normalizeProviderModelForMatch(version.provider) === providerKey &&
            normalizeProviderModelForMatch(version.model) === modelKey
          )
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]

      const subtitleId = await DB.addSubtitle(input.cues, input.subtitleFilename, input.fingerprint)

      if (matchedVersion) {
        const oldSubtitleId = matchedVersion.subtitleId
        await db.local_subtitles.update(matchedVersion.id, {
          subtitleId,
          name: input.subtitleName,
          sourceKind: 'asr_online',
          provider: input.provider,
          model: input.model,
          createdAt: now,
          status: 'ready',
        })

        const oldRefCount = await db.local_subtitles
          .where('subtitleId')
          .equals(oldSubtitleId)
          .count()
        if (oldRefCount === 0) {
          await db.subtitles.delete(oldSubtitleId)
        }

        if (input.setActive !== false) {
          await db.tracks.update(input.trackId, { activeSubtitleId: matchedVersion.id })
        }

        return {
          ok: true,
          reason: UPSERT_FILE_ASR_SUBTITLE_REASON.REPLACED,
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
        await db.tracks.update(input.trackId, { activeSubtitleId: fileSubtitleId })
      }

      return { ok: true, reason: UPSERT_FILE_ASR_SUBTITLE_REASON.CREATED, fileSubtitleId }
    })
  },
}

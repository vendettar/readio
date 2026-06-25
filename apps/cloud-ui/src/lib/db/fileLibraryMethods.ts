import Dexie, { type IndexableType } from 'dexie'

import { warn } from '../logger'

import { normalizeRequiredCountryAtSave, normalizeRequiredText } from './recordNormalizers'
import type { ReadioDB } from './schema'
import type {
  FileFolder,
  FileSubtitle,
  FileTrack,
  PodcastDownload,
  PodcastDownloadCreateInput,
  Track,
} from './types'
import {
  fromStoredFolderId,
  isPodcastDownloadTrack,
  isUserUploadTrack,
  TRACK_SOURCE,
  toStoredFolderId,
} from './types'

interface AudioBlobReferenceCounts {
  referencedBySession: number
  referencedByTrackAudio: number
  referencedByTrackArtwork: number
}

type GetAudioBlobReferenceCounts = (
  audioId: string,
  options?: { excludeTrackId?: string }
) => Promise<AudioBlobReferenceCounts>

function compareFileSubtitlesForDisplay(a: FileSubtitle, b: FileSubtitle): number {
  const createdAtDelta = a.createdAt - b.createdAt
  if (createdAtDelta !== 0) return createdAtDelta

  const nameDelta = a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  if (nameDelta !== 0) return nameDelta

  return a.id.localeCompare(b.id)
}

function toPublicFileTrack(track: FileTrack): FileTrack {
  return {
    ...track,
    folderId: fromStoredFolderId(track.folderId),
  }
}

export function createFileLibraryDbMethods(
  db: ReadioDB,
  generateId: () => string,
  getAudioBlobReferenceCounts: GetAudioBlobReferenceCounts
) {
  async function clearLocalPlaybackSessionAudioRefs(
    trackId: string,
    audioId?: string
  ): Promise<void> {
    await db.playback_sessions
      .where('localTrackId')
      .equals(trackId)
      .modify((session) => {
        session.localTrackId = null
        if (audioId && session.audioId === audioId) {
          session.audioId = null
          session.hasAudioBlob = false
        }
      })

    if (!audioId) return

    await db.playback_sessions
      .where('audioId')
      .equals(audioId)
      .and((session) => session.source === 'local' && !session.localTrackId)
      .modify((session) => {
        session.audioId = null
        session.hasAudioBlob = false
      })
  }

  async function deleteAudioBlobIfUnreferenced(
    audioId: string,
    excludeTrackId: string
  ): Promise<void> {
    const refs = await getAudioBlobReferenceCounts(audioId, { excludeTrackId })
    if (
      refs.referencedBySession === 0 &&
      refs.referencedByTrackAudio === 0 &&
      refs.referencedByTrackArtwork === 0
    ) {
      await db.audioBlobs.delete(audioId)
    }
  }

  async function deleteFileSubtitleWithBlobProtection(
    id: string
  ): Promise<FileSubtitle | undefined> {
    const sub = await db.local_subtitles.get(id)
    if (!sub) return undefined

    if (sub.subtitleId) {
      const refCount = await db.local_subtitles.where('subtitleId').equals(sub.subtitleId).count()
      if (refCount <= 1) {
        await db.subtitles.delete(sub.subtitleId)
      }
    }
    await db.local_subtitles.delete(id)
    return sub
  }

  async function deleteFileSubtitleInternal(id: string): Promise<void> {
    await deleteFileSubtitleWithBlobProtection(id)
  }

  async function deleteFileTrackInternal(id: string): Promise<void> {
    const track = await db.tracks.get(id)
    if (!isUserUploadTrack(track)) {
      if (track) {
        warn(
          `[DB] deleteFileTrack: sourceType mismatch for ${id}. Expected USER_UPLOAD, got ${track.sourceType}`
        )
      }
      return
    }

    const fileSubs = await db.local_subtitles.where('trackId').equals(id).toArray()
    for (const fileSub of fileSubs) {
      await deleteFileSubtitleInternal(fileSub.id)
    }

    if (track.audioId) {
      await clearLocalPlaybackSessionAudioRefs(id, track.audioId)
      await deleteAudioBlobIfUnreferenced(track.audioId, id)
    }

    if (track.artworkId) {
      await deleteAudioBlobIfUnreferenced(track.artworkId, id)
    }

    await db.tracks.delete(id)
  }

  return {
    async getAllFolderIds(): Promise<string[]> {
      const ids = await db.folders.toCollection().primaryKeys()
      return ids as string[]
    },

    async addFolder(name: string): Promise<string> {
      const folder: FileFolder = {
        id: generateId(),
        name,
        createdAt: Date.now(),
      }
      await db.folders.add(folder)
      return folder.id
    },

    async getFolder(id: string): Promise<FileFolder | undefined> {
      return db.folders.get(id)
    },

    async getAllFolders(): Promise<FileFolder[]> {
      return db.folders.orderBy('createdAt').toArray()
    },

    async deleteFolder(id: string): Promise<void> {
      return db.transaction(
        'rw',
        [
          db.folders,
          db.tracks,
          db.local_subtitles,
          db.audioBlobs,
          db.subtitles,
          db.playback_sessions,
        ],
        async () => {
          const tracks = await db.tracks.where('folderId').equals(id).toArray()
          for (const track of tracks) {
            await deleteFileTrackInternal(track.id)
          }
          await db.folders.delete(id)
        }
      )
    },

    async updateFolder(
      id: string,
      data: Partial<Pick<FileFolder, 'name' | 'pinnedAt'>>
    ): Promise<void> {
      await db.folders.update(id, data)
    },

    async addFileTrack(data: Omit<FileTrack, 'id' | 'createdAt' | 'sourceType'>): Promise<string> {
      const track: FileTrack = {
        id: generateId(),
        ...data,
        folderId: toStoredFolderId(data.folderId),
        sourceType: TRACK_SOURCE.USER_UPLOAD,
        createdAt: Date.now(),
      }
      await db.tracks.add(track)
      return track.id
    },

    async updateTrackPatch(id: string, patch: Partial<Track>): Promise<boolean> {
      const normalizedPatch = { ...patch }
      if ('folderId' in normalizedPatch) {
        normalizedPatch.folderId = toStoredFolderId(normalizedPatch.folderId)
      }
      const updated = await db.tracks.update(id, normalizedPatch)
      return updated > 0
    },

    async updateFileTrack(id: string, updates: Partial<FileTrack>): Promise<void> {
      const normalizedUpdates = { ...updates }
      if ('folderId' in normalizedUpdates) {
        normalizedUpdates.folderId = toStoredFolderId(normalizedUpdates.folderId)
      }
      await db.tracks.update(id, normalizedUpdates)
    },

    async getFileTrack(id: string): Promise<FileTrack | undefined> {
      const track = await db.tracks.get(id)
      if (isUserUploadTrack(track)) return toPublicFileTrack(track)
      return undefined
    },

    async getFileTracksInFolder(folderId: string | null | undefined): Promise<FileTrack[]> {
      const normalizedFolderId = toStoredFolderId(folderId)
      const primaryResults = await db.tracks
        .where('[sourceType+folderId+createdAt]')
        .between(
          [TRACK_SOURCE.USER_UPLOAD, normalizedFolderId, Dexie.minKey],
          [TRACK_SOURCE.USER_UPLOAD, normalizedFolderId, Dexie.maxKey]
        )
        .reverse()
        .toArray()
      return (primaryResults as FileTrack[]).map(toPublicFileTrack)
    },

    async getFileTracksCountInFolder(folderId: string | null | undefined): Promise<number> {
      const normalizedFolderId = toStoredFolderId(folderId)
      return db.tracks
        .where('[sourceType+folderId]')
        .equals([TRACK_SOURCE.USER_UPLOAD, normalizedFolderId] as IndexableType)
        .count()
    },

    async getAllFileTracks(): Promise<FileTrack[]> {
      const tracks = await db.tracks
        .where('[sourceType+createdAt]')
        .between([TRACK_SOURCE.USER_UPLOAD, Dexie.minKey], [TRACK_SOURCE.USER_UPLOAD, Dexie.maxKey])
        .reverse()
        .toArray()
      return (tracks as FileTrack[]).map(toPublicFileTrack)
    },

    async getAllTrackIds(): Promise<string[]> {
      const ids = await db.tracks.toCollection().primaryKeys()
      return ids as string[]
    },

    async iterateAllTracks(callback: (track: Track) => void | Promise<void>): Promise<void> {
      await db.tracks.toCollection().each(callback)
    },

    async deleteFileTrack(id: string): Promise<void> {
      return db.transaction(
        'rw',
        [db.tracks, db.local_subtitles, db.audioBlobs, db.subtitles, db.playback_sessions],
        async () => {
          await deleteFileTrackInternal(id)
        }
      )
    },

    async searchFileTracksByName(query: string, limit = 200): Promise<FileTrack[]> {
      if (!query) return []
      const tracks = await db.tracks
        .where('name')
        .startsWithIgnoreCase(query)
        .limit(limit)
        .toArray()
      return tracks.filter(isUserUploadTrack)
    },

    async addPodcastDownload(data: PodcastDownloadCreateInput): Promise<string> {
      const download: PodcastDownload = {
        id: generateId(),
        ...data,
        sourceUrlNormalized: normalizeRequiredText(
          data.sourceUrlNormalized,
          'podcast download sourceUrlNormalized'
        ),
        countryAtSave: normalizeRequiredCountryAtSave(data.countryAtSave, 'podcast download'),
        sourcePodcastItunesId: normalizeRequiredText(
          data.sourcePodcastItunesId,
          'podcast download sourcePodcastItunesId'
        ),
        sourceEpisodeGuid: normalizeRequiredText(
          data.sourceEpisodeGuid,
          'podcast download sourceEpisodeGuid'
        ),
        sourcePodcastTitle: normalizeRequiredText(
          data.sourcePodcastTitle,
          'podcast download sourcePodcastTitle'
        ),
        sourceEpisodeTitle: normalizeRequiredText(
          data.sourceEpisodeTitle,
          'podcast download sourceEpisodeTitle'
        ),
        sourceDescription: data.sourceDescription,
        sourceArtworkUrl: normalizeRequiredText(
          data.sourceArtworkUrl,
          'podcast download sourceArtworkUrl'
        ),
        sourceType: TRACK_SOURCE.PODCAST_DOWNLOAD,
        createdAt: Date.now(),
      }
      await db.tracks.add(download)
      return download.id
    },

    async getPodcastDownloadByUrl(url: string): Promise<PodcastDownload | undefined> {
      const track = await db.tracks
        .where('[sourceType+sourceUrlNormalized]')
        .equals([TRACK_SOURCE.PODCAST_DOWNLOAD, url])
        .first()
      return track as PodcastDownload | undefined
    },

    async getAllPodcastDownloads(): Promise<PodcastDownload[]> {
      const tracks = await db.tracks
        .where('[sourceType+createdAt]')
        .between(
          [TRACK_SOURCE.PODCAST_DOWNLOAD, Dexie.minKey],
          [TRACK_SOURCE.PODCAST_DOWNLOAD, Dexie.maxKey]
        )
        .reverse()
        .toArray()
      return tracks as PodcastDownload[]
    },

    async updatePodcastDownload(id: string, updates: Partial<PodcastDownload>): Promise<void> {
      await db.tracks.update(id, updates)
    },

    async removePodcastDownloadWithCleanup(id: string): Promise<boolean> {
      return db.transaction(
        'rw',
        [db.tracks, db.audioBlobs, db.subtitles, db.local_subtitles, db.playback_sessions],
        async () => {
          const download = await db.tracks.get(id)
          if (!isPodcastDownloadTrack(download)) {
            if (download) {
              warn(
                `[DB] deletePodcastDownload: sourceType mismatch for ${id}. Expected PODCAST_DOWNLOAD, got ${download.sourceType}`
              )
            }
            return false
          }

          const fileSubs = await db.local_subtitles.where('trackId').equals(id).toArray()
          for (const fileSub of fileSubs) {
            await deleteFileSubtitleInternal(fileSub.id)
          }

          await clearLocalPlaybackSessionAudioRefs(id, download.audioId)
          await deleteAudioBlobIfUnreferenced(download.audioId, id)

          if (download.artworkId) {
            await deleteAudioBlobIfUnreferenced(download.artworkId, id)
          }

          await db.tracks.delete(id)
          return true
        }
      )
    },

    async searchPodcastDownloadsByName(query: string, limit = 200): Promise<PodcastDownload[]> {
      if (!query) return []
      const tracks = await db.tracks
        .where('name')
        .startsWithIgnoreCase(query)
        .limit(limit)
        .toArray()
      return tracks.filter(isPodcastDownloadTrack)
    },

    async addFileSubtitle(
      data: Omit<FileSubtitle, 'id' | 'createdAt'> & Partial<Pick<FileSubtitle, 'createdAt'>>
    ): Promise<string> {
      const fileSub: FileSubtitle = {
        id: generateId(),
        createdAt: Date.now(),
        ...data,
      }
      await db.local_subtitles.add(fileSub)
      return fileSub.id
    },

    async getFileSubtitlesForTrack(trackId: string): Promise<FileSubtitle[]> {
      const subtitles = await db.local_subtitles.where('trackId').equals(trackId).toArray()
      return subtitles.sort(compareFileSubtitlesForDisplay)
    },

    async iterateAllLocalSubtitles(
      callback: (sub: FileSubtitle) => void | Promise<void>
    ): Promise<void> {
      await db.local_subtitles.toCollection().each(callback)
    },

    async deleteLocalSubtitlesBulk(ids: string[]): Promise<number> {
      if (ids.length === 0) return 0
      await db.local_subtitles.bulkDelete(ids)
      return ids.length
    },

    async deleteFileSubtitle(id: string): Promise<void> {
      return db.transaction('rw', [db.local_subtitles, db.subtitles], async () => {
        await deleteFileSubtitleInternal(id)
      })
    },

    async deleteDownloadSubtitleVersion(trackId: string, fileSubtitleId: string): Promise<boolean> {
      return db.transaction('rw', [db.tracks, db.local_subtitles, db.subtitles], async () => {
        const download = await db.tracks.get(trackId)
        if (!isPodcastDownloadTrack(download)) {
          if (import.meta.env.DEV) {
            warn('[DB] deleteDownloadSubtitleVersion blocked: invalid download track', {
              trackId,
            })
          }
          return false
        }

        const version = await db.local_subtitles.get(fileSubtitleId)
        if (!version || version.trackId !== trackId) {
          if (import.meta.env.DEV) {
            warn('[DB] deleteDownloadSubtitleVersion blocked: version mismatch', {
              fileSubtitleId,
              trackId,
            })
          }
          return false
        }

        await deleteFileSubtitleWithBlobProtection(fileSubtitleId)

        if (download.activeSubtitleId === fileSubtitleId) {
          const remaining = await db.local_subtitles.where('trackId').equals(trackId).toArray()
          const readyVersions = remaining
            .filter((version) => version.status === 'ready' || version.status === undefined)
            .sort((a, b) => b.createdAt - a.createdAt)

          const fallbackId = readyVersions.length > 0 ? readyVersions[0].id : undefined
          await db.tracks.update(trackId, {
            activeSubtitleId: fallbackId,
          })
        }

        return true
      })
    },
  }
}

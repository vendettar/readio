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
import {
  getSubtitleExportMimeType,
  parseSubtitles,
  type SubtitleExportFormat,
  serializeSubtitleExport,
} from '../subtitles'
import { buildPrioritizedSubtitleCandidates } from './SubtitleCandidateBuilder'
import {
  findLatestAsrSubtitleVersion,
  replaceSubtitleVersionContentAndCleanup,
  resolveDuplicateSubtitleFilename,
} from './subtitleVersionShared'

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

export const IMPORT_FILE_TRANSCRIPT_REASON = {
  IMPORTED: 'imported',
  TRACK_NOT_FOUND: 'track_not_found',
  INVALID_TRANSCRIPT_CONTENT: 'invalid_transcript_content',
} as const

export type ImportFileTranscriptReason =
  (typeof IMPORT_FILE_TRANSCRIPT_REASON)[keyof typeof IMPORT_FILE_TRANSCRIPT_REASON]

export interface ImportFileTranscriptResult {
  ok: boolean
  reason: ImportFileTranscriptReason
  fileSubtitleId?: string
}

export interface FileExportResult {
  ok: boolean
  filename?: string
  blob?: Blob
}

export interface PreparedSubtitleAttachmentInput {
  filename: string
  cues: ASRCue[]
}

export interface PreparedFileIngestInput {
  audioFile: File
  folderId: string | null
  trackName: string
  durationSeconds: number
  album?: string
  artist?: string
  artworkBlob?: Blob
  matchingSubtitles: PreparedSubtitleAttachmentInput[]
}

export interface FileIngestPersistenceResult {
  createdTrackIds: string[]
  attachedSubtitleCount: number
}

export const FilesRepository = {
  getAllFolders(): Promise<FileFolder[]> {
    return DB.getAllFolders()
  },

  addFolder(name: string): Promise<string> {
    return DB.addFolder(name)
  },

  deleteFolder(id: string): Promise<void> {
    return DB.deleteFolder(id)
  },

  getAllFileTracks(): Promise<FileTrack[]> {
    return DB.getAllFileTracks()
  },

  searchFileTracksByName(query: string, limit = 200): Promise<FileTrack[]> {
    return DB.searchFileTracksByName(query, limit)
  },

  getFileTracksInFolder(folderId: string | null | undefined): Promise<FileTrack[]> {
    return DB.getFileTracksInFolder(folderId)
  },

  getFileTracksCountInFolder(folderId: string | null | undefined): Promise<number> {
    return DB.getFileTracksCountInFolder(folderId)
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

  async persistPreparedFileImports(
    preparedTracks: PreparedFileIngestInput[],
    folderId: string | null
  ): Promise<FileIngestPersistenceResult> {
    return db.transaction(
      'rw',
      [db.tracks, db.audioBlobs, db.subtitles, db.local_subtitles, db.folders],
      async () => {
        const createdTrackIds: string[] = []
        let attachedSubtitleCount = 0
        const existingTracks = await DB.getFileTracksInFolder(folderId)
        const existingTrackNames = existingTracks.map((track) => track.name)
        const usedSubtitleFilenames = new Set<string>()

        for (const preparedTrack of preparedTracks) {
          const finalTrackName = resolveDuplicateTrackName(
            preparedTrack.trackName,
            existingTrackNames
          )
          existingTrackNames.push(finalTrackName)

          let artworkId: string | undefined
          if (preparedTrack.artworkBlob) {
            artworkId = await DB.addAudioBlob(
              preparedTrack.artworkBlob,
              `artwork-${preparedTrack.audioFile.name}`
            )
          }

          const audioId = await DB.addAudioBlob(
            preparedTrack.audioFile,
            preparedTrack.audioFile.name
          )
          const trackId = await DB.addFileTrack({
            folderId: preparedTrack.folderId,
            name: finalTrackName,
            audioId,
            sizeBytes: preparedTrack.audioFile.size,
            durationSeconds: preparedTrack.durationSeconds,
            artworkId,
            album: preparedTrack.album,
            artist: preparedTrack.artist,
          })
          createdTrackIds.push(trackId)

          const existingSubtitleNames = (await DB.getFileSubtitlesForTrack(trackId)).map(
            (subtitle) => subtitle.name
          )

          for (const matchingSubtitle of preparedTrack.matchingSubtitles) {
            if (usedSubtitleFilenames.has(matchingSubtitle.filename)) {
              continue
            }

            if (matchingSubtitle.cues.length === 0) {
              continue
            }

            const subtitleName = resolveDuplicateSubtitleFilename(
              matchingSubtitle.filename,
              existingSubtitleNames
            )
            existingSubtitleNames.push(subtitleName)

            const subtitleId = await DB.addSubtitle(matchingSubtitle.cues, subtitleName)
            await DB.addFileSubtitle({
              trackId,
              name: subtitleName,
              subtitleId,
            })
            attachedSubtitleCount += 1
            usedSubtitleFilenames.add(matchingSubtitle.filename)
          }
        }

        return { createdTrackIds, attachedSubtitleCount }
      }
    )
  },

  async attachPreparedSubtitleToTrack(
    trackId: string,
    subtitle: PreparedSubtitleAttachmentInput
  ): Promise<string> {
    return db.transaction('rw', [db.tracks, db.local_subtitles, db.subtitles], async () => {
      const track = await db.tracks.get(trackId)
      if (!isUserUploadTrack(track)) {
        throw new Error(`Track ${trackId} not found for subtitle attachment`)
      }

      const existingNames = (await DB.getFileSubtitlesForTrack(trackId)).map((item) => item.name)
      const subtitleName = resolveDuplicateSubtitleFilename(subtitle.filename, existingNames)
      const subtitleId = await DB.addSubtitle(subtitle.cues, subtitleName)
      const fileSubtitleId = await DB.addFileSubtitle({
        trackId,
        name: subtitleName,
        subtitleId,
      })

      await db.tracks.update(trackId, { activeSubtitleId: fileSubtitleId })
      return fileSubtitleId
    })
  },

  async importTranscriptVersion(
    trackId: string,
    input: { filename: string; content: string }
  ): Promise<ImportFileTranscriptResult> {
    const cues = parseSubtitles(input.content)
    if (cues.length === 0) {
      return { ok: false, reason: IMPORT_FILE_TRANSCRIPT_REASON.INVALID_TRANSCRIPT_CONTENT }
    }

    return db.transaction('rw', [db.tracks, db.local_subtitles, db.subtitles], async () => {
      const track = await db.tracks.get(trackId)
      if (!isUserUploadTrack(track)) {
        return { ok: false, reason: IMPORT_FILE_TRANSCRIPT_REASON.TRACK_NOT_FOUND }
      }

      const existing = await db.local_subtitles.where('trackId').equals(trackId).toArray()
      const existingNames = existing.map((subtitle) => subtitle.name)
      const versionName = resolveDuplicateSubtitleFilename(
        input.filename,
        existingNames,
        'transcript.srt'
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

      return {
        ok: true,
        reason: IMPORT_FILE_TRANSCRIPT_REASON.IMPORTED,
        fileSubtitleId,
      }
    })
  },

  async exportActiveTranscriptVersion(
    trackId: string,
    trackName: string,
    format: SubtitleExportFormat = 'srt'
  ): Promise<FileExportResult> {
    const track = await db.tracks.get(trackId)
    if (!isUserUploadTrack(track)) {
      return { ok: false }
    }

    const readySubtitles = await this.getReadySubtitlesByTrackId(trackId)
    const activeTranscript = readySubtitles[0]
    if (!activeTranscript) {
      return { ok: false }
    }

    const filename = `${resolveFileExportBaseName(trackName, trackId)}.transcript.${format}`
    const blob = new Blob([serializeSubtitleExport(activeTranscript.subtitle.cues, format)], {
      type: getSubtitleExportMimeType(format),
    })

    return { ok: true, filename, blob }
  },

  async exportAudioFile(trackId: string, fallbackTrackName: string): Promise<FileExportResult> {
    const track = await db.tracks.get(trackId)
    if (!track || !isUserUploadTrack(track)) {
      return { ok: false }
    }

    const audioBlob = await DB.getAudioBlob(track.audioId)
    if (!audioBlob) {
      return { ok: false }
    }

    return {
      ok: true,
      filename: resolveAudioExportFilename(audioBlob, fallbackTrackName, trackId),
      blob: audioBlob.blob,
    }
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

function resolveDuplicateTrackName(name: string, existingNames: string[]): string {
  const base = name.trim()
  let candidate = base
  let counter = 2
  const lower = (value: string) => value.trim().toLowerCase()

  while (existingNames.some((existing) => lower(existing) === lower(candidate))) {
    candidate = `${base} (${counter})`
    counter += 1
  }

  return candidate
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.')
  return lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename
}

function resolveFileExportBaseName(title: string, id: string): string {
  const safeName = sanitizeFilenameSegment(title) || 'track'
  return `${safeName}.${id}`
}

function resolveAudioExportFilename(
  audioBlob: AudioBlob,
  fallbackTrackName: string,
  trackId: string
): string {
  const audioFilename = audioBlob.filename?.trim()
  if (audioFilename) {
    return audioFilename
  }

  const baseName = resolveFileExportBaseName(fallbackTrackName, trackId)
  const extension = inferAudioExtension(audioBlob)
  return `${stripExtension(baseName)}${extension}`
}

function inferAudioExtension(audioBlob: AudioBlob): string {
  const type = audioBlob.blob.type || audioBlob.type || ''
  if (type.includes('mpeg')) return '.mp3'
  if (type.includes('mp4')) return '.m4a'
  if (type.includes('wav')) return '.wav'
  if (type.includes('ogg')) return '.ogg'
  if (type.includes('flac')) return '.flac'
  if (type.includes('aac')) return '.aac'
  return '.audio'
}

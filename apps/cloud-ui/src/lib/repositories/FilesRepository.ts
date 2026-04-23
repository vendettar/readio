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
      const versionName = resolveDuplicateName(input.filename, existingNames)

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
        .sort((a, b) => b.createdAt - a.createdAt)[0]

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

function resolveDuplicateName(filename: string, existingNames: string[]): string {
  const trimmed = filename.trim() || 'transcript.srt'
  if (!existingNames.includes(trimmed)) {
    return trimmed
  }

  const lastDotIndex = trimmed.lastIndexOf('.')
  const hasExtension = lastDotIndex > 0
  const basename = hasExtension ? trimmed.slice(0, lastDotIndex) : trimmed
  const extension = hasExtension ? trimmed.slice(lastDotIndex) : ''

  let suffix = 2
  let candidate = `${basename} (${suffix})${extension}`
  while (existingNames.includes(candidate)) {
    suffix += 1
    candidate = `${basename} (${suffix})${extension}`
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

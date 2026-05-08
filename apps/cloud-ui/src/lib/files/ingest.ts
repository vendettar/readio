// src/lib/files/ingest.ts
// Pure ingestion module for files - no React, no UI side effects

import type { ParseResult } from '../../workers/metadata.worker'
import MetadataWorker from '../../workers/metadata.worker?worker'
import { log } from '../logger'
import {
  FilesRepository,
  type FileIngestPersistenceResult,
  type PreparedFileIngestInput,
  type PreparedSubtitleAttachmentInput,
} from '../repositories/FilesRepository'
import { parseSubtitles } from '../subtitles'

/**
 * Parse metadata using a Web Worker to avoid blocking the main thread
 */
function parseMetadataInWorker(file: File): Promise<ParseResult> {
  return new Promise((resolve, _reject) => {
    const worker = new MetadataWorker()

    worker.onmessage = (e) => {
      const { success, data, error } = e.data
      worker.terminate()
      if (success) {
        resolve(data)
      } else {
        // Resolve with empty/partial data instead of rejecting to allow fallback
        log('[Files] Worker parsing warning:', error)
        resolve({})
      }
    }

    worker.onerror = (err) => {
      worker.terminate()
      log('[Files] Worker parsing error:', err)
      resolve({})
    }

    worker.postMessage(file)
  })
}

/**
 * Read file content as text with fallback for different environments
 */
function readFileAsText(file: File): Promise<string> {
  // Try file.text() first (modern browsers)
  if (typeof file.text === 'function') {
    return file.text()
  }
  // Fallback to FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/**
 * Result of ingesting files
 */
export interface IngestResult {
  createdTrackIds: string[]
  attachedSubtitleCount: number
}

/**
 * Parameters for ingesting files
 */
export interface IngestParams {
  files: File[]
  folderId: string | null
}

/**
 * Resolve duplicate name by appending counter (simple append, no parsing)
 * e.g. "Draft" -> "Draft (2)", "Draft (2)" -> "Draft (2) (2)"
 */
export function resolveDuplicateName(name: string, existingNames: string[]): string {
  const base = name.trim()
  let finalName = base
  let counter = 2
  const lower = (s: string) => s.trim().toLowerCase()

  // Loop until we find a name that doesn't exist
  while (existingNames.some((n) => lower(n) === lower(finalName))) {
    finalName = `${base} (${counter})`
    counter++
  }
  return finalName
}

/**
 * Ingest files (audio + subtitles) into the database.
 *
 * - audio files create tracks
 * - SRT/VTT files with matching base names are auto-attached
 * - No React dependencies, no UI side effects
 *
 * @returns Track IDs created and count of subtitles attached
 */
interface PreparedItem {
  file: File
  metadataTitle?: string
  metadataAlbum?: string
  metadataArtist?: string
  artworkBlob?: Blob
  durationSeconds: number
  matchingSubs: PreparedSubtitleAttachmentInput[]
}

export async function ingestFiles(params: IngestParams): Promise<IngestResult> {
  const { files, folderId } = params

  const audioFiles = files.filter((f) => f.type.startsWith('audio/'))
  const subFiles = files.filter((f) => {
    const lowerName = f.name.toLowerCase()
    return lowerName.endsWith('.srt') || lowerName.endsWith('.vtt')
  })

  // Pre-process files OUTSIDE the transaction to keep it fast and minimize locking
  // This includes heavy work like parsing metadata in workers and reading text files
  const preparedItems: PreparedItem[] = []

  for (const file of audioFiles) {
    // Extract metadata using Worker
    let metadataTitle: string | undefined
    let metadataAlbum: string | undefined
    let metadataArtist: string | undefined
    let metadataDuration: number | undefined
    let artworkBlob: Blob | undefined

    try {
      const metadata = await parseMetadataInWorker(file)
      metadataTitle = metadata.title
      metadataAlbum = metadata.album
      metadataArtist = metadata.artist
      metadataDuration = metadata.duration
      artworkBlob = metadata.artworkBlob
    } catch (err) {
      log('[Files] Metadata parsing failed, using fallbacks:', file.name, err)
    }

    // Fallback duration logic
    let durationSeconds = metadataDuration || 0
    if (durationSeconds <= 0 && typeof Audio !== 'undefined') {
      try {
        const objectUrl = URL.createObjectURL(file)
        const audio = new Audio(objectUrl)
        durationSeconds = await new Promise((resolve) => {
          let settled = false
          let timeoutId: number | undefined

          const cleanupAudio = (resolvedDuration: number) => {
            if (settled) return
            settled = true
            if (timeoutId) clearTimeout(timeoutId)
            URL.revokeObjectURL(objectUrl)
            audio.removeAttribute('src')
            audio.src = ''
            audio.load()
            resolve(resolvedDuration)
          }

          audio.addEventListener(
            'loadedmetadata',
            () => {
              const d = audio.duration
              cleanupAudio(d && Number.isFinite(d) ? d : 0)
            },
            { once: true }
          )
          audio.addEventListener('error', () => cleanupAudio(0), { once: true })
          timeoutId = window.setTimeout(() => cleanupAudio(0), 2000)
        })
      } catch (err) {
        log('[Files] Audio element duration fallback failed:', err)
      }
    }

    // Auto-match subtitles
    const matchingSubs: PreparedSubtitleAttachmentInput[] = []
    const originalFileBase = file.name.replace(/\.[^/.]+$/, '')

    for (const sub of subFiles) {
      const subBaseName = sub.name.replace(/\.[^/.]+$/, '')
      if (subBaseName === originalFileBase || sub.name.startsWith(originalFileBase)) {
        const text = await readFileAsText(sub)
        matchingSubs.push({
          filename: sub.name,
          cues: parseSubtitles(text),
        })
      }
    }

    preparedItems.push({
      file,
      metadataTitle,
      metadataAlbum,
      metadataArtist,
      artworkBlob,
      durationSeconds,
      matchingSubs,
    })
  }

  const preparedTracks: PreparedFileIngestInput[] = preparedItems.map((item) => ({
    audioFile: item.file,
    folderId,
    trackName: item.metadataTitle || item.file.name.replace(/\.[^/.]+$/, ''),
    durationSeconds: item.durationSeconds,
    album: item.metadataAlbum,
    artist: item.metadataArtist,
    artworkBlob: item.artworkBlob,
    matchingSubtitles: item.matchingSubs,
  }))

  const result: FileIngestPersistenceResult =
    await FilesRepository.persistPreparedFileImports(preparedTracks, folderId)
  for (const trackId of result.createdTrackIds) {
    log('[Files] Added track (Transaction):', trackId)
  }
  return result
}

/**
 * Attach a subtitle file to an existing track
 */
export async function attachSubtitleToTrack(file: File, trackId: string): Promise<string> {
  const text = await readFileAsText(file)
  const parsedCues = parseSubtitles(text)
  if (parsedCues.length === 0) {
    throw new Error(`Failed to parse subtitles from ${file.name} (file may be empty or invalid)`)
  }

  return FilesRepository.attachPreparedSubtitleToTrack(trackId, {
    filename: file.name,
    cues: parsedCues,
  })
}

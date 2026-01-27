// src/lib/files/ingest.ts
// Pure ingestion module for files - no React, no UI side effects

import { DB } from '../dexieDb'
import { log } from '../logger'
import type { ParseResult } from './metadata.worker'
import MetadataWorker from './metadata.worker?worker'

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
    // If name already has format "Name (X)", try to increment it?
    // Requirement says: "Simple append rule (no parsing)"
    // "Interview (2).mp3 -> Interview (2) (2).mp3"
    // So we just blindly append counter to the ORIGINAL base
    // Wait, loop implies we might generate "Name (2)" then if that exists, "Name (3)"?
    // Requirement example: "Interview (2).mp3 -> Interview (2) (2).mp3"
    // This means if I have "A" and "A" comes in -> "A (2)".
    // If I have "A" and "A (2)" and "A" comes in -> "A (3)"?
    // Or does it mean if I have "A (2)" and upload "A (2)" -> "A (2) (2)"?
    //
    // Clarification from prompt:
    // "Simple append rule (no parsing tail)"
    // - If original name contains (2), continue to append.
    // - Example: Interview (2).mp3 -> Interview (2) (2).mp3
    //
    // This implies we DO NOT increment the existing counter in the name,
    // but we DO increment the counter WE are appending if our generated name conflicts.

    // Let's stick to standard "Name (N)" logic relative to the *input* name.
    // If input is "Foo", we try "Foo", then "Foo (2)", then "Foo (3)".
    // If input is "Foo (2)", we try "Foo (2)", then "Foo (2) (2)", then "Foo (2) (3)".

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
export async function ingestFiles(params: IngestParams): Promise<IngestResult> {
  const { files, folderId } = params

  const audioFiles = files.filter((f) => f.type.startsWith('audio/'))
  const subFiles = files.filter((f) => {
    const lowerName = f.name.toLowerCase()
    return lowerName.endsWith('.srt') || lowerName.endsWith('.vtt')
  })

  const createdTrackIds: string[] = []
  let attachedSubtitleCount = 0

  // Fetch existing tracks in this folder to check for duplicates
  // We only need names for conflict resolution
  const existingTracks = await DB.getFileTracksInFolder(folderId ?? null)
  const existingTrackNames = existingTracks.map((t) => t.name)

  // Track which subtitle files have been used to prevent duplicate binding
  const usedSubtitleFiles = new Set<File>()

  for (const file of audioFiles) {
    // Extract metadata using Worker
    let metadataTitle: string | undefined
    let metadataDuration: number | undefined
    let artworkId: string | undefined

    try {
      const metadata = await parseMetadataInWorker(file)

      metadataTitle = metadata.title
      metadataDuration = metadata.duration

      if (metadata.artworkBlob) {
        artworkId = await DB.addAudioBlob(metadata.artworkBlob, `artwork-${file.name}`)
      }
    } catch (err) {
      log('[Files] Metadata parsing failed, using fallbacks:', file.name, err)
    }

    // Fallback to 0 if metadata didn't provide it (will be updated on play)
    let durationSeconds = metadataDuration || 0

    // CRITICAL FIX: If metadata worker failed to get duration, try Audio element fallback
    // This is useful for browser-supported formats like MP3/WAV that the worker might miss.
    if (durationSeconds <= 0 && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(URL.createObjectURL(file))
        durationSeconds = await new Promise((resolve) => {
          audio.addEventListener(
            'loadedmetadata',
            () => {
              const d = audio.duration
              URL.revokeObjectURL(audio.src)
              resolve(d && Number.isFinite(d) ? d : 0)
            },
            { once: true }
          )
          audio.addEventListener(
            'error',
            () => {
              URL.revokeObjectURL(audio.src)
              resolve(0)
            },
            { once: true }
          )
          // Safety timeout
          setTimeout(() => {
            URL.revokeObjectURL(audio.src)
            resolve(0)
          }, 2000)
        })
      } catch (err) {
        log('[Files] Audio element duration fallback failed:', err)
      }
    }

    // Use metadata title if available, otherwise fallback to filename without extension
    let baseName = metadataTitle || file.name.replace(/\.[^/.]+$/, '')

    // Resolve duplication against existing tracks in DB
    baseName = resolveDuplicateName(baseName, existingTrackNames)

    // Add this new name to our local list so subsequent files in THIS BATCH also check against it
    existingTrackNames.push(baseName)

    // Store audio blob
    const audioId = await DB.addAudioBlob(file, file.name)

    // Create track
    const trackId = await DB.addFileTrack({
      folderId,
      name: baseName,
      audioId,
      sizeBytes: file.size,
      durationSeconds,
      artworkId,
    })

    createdTrackIds.push(trackId)

    // Auto-match subtitles by base name (only unused subtitles)
    const matchingSubs = subFiles.filter((s) => {
      if (usedSubtitleFiles.has(s)) return false // Skip already used subtitles
      const subBaseName = s.name.replace(/\.[^/.]+$/, '')
      // Match original filename base
      const originalFileBase = file.name.replace(/\.[^/.]+$/, '')
      return subBaseName === originalFileBase || s.name.startsWith(originalFileBase)
    })

    // Fetch existing subtitles for this new track (empty since it's new, but good practice)
    const existingSubtitles = await DB.getFileSubtitlesForTrack(trackId)
    const existingSubtitleNames = existingSubtitles.map((s) => s.name)

    for (const sub of matchingSubs) {
      const text = await readFileAsText(sub)

      // Check for duplicate subtitle names (filename based)
      let subName = sub.name
      subName = resolveDuplicateName(subName, existingSubtitleNames)
      existingSubtitleNames.push(subName)

      const subtitleId = await DB.addSubtitle(text, subName)
      await DB.addFileSubtitle({
        trackId,
        name: subName,
        subtitleId,
      })
      attachedSubtitleCount++

      // Mark this subtitle file as used
      usedSubtitleFiles.add(sub)
    }

    log('[Files] Added track:', baseName, artworkId ? '(with artwork)' : '(no artwork)')
  }

  return { createdTrackIds, attachedSubtitleCount }
}

/**
 * Attach a subtitle file to an existing track
 */
export async function attachSubtitleToTrack(file: File, trackId: string): Promise<string> {
  const text = await readFileAsText(file)

  // Fetch existing subtitles to check duplicates
  const existingSubtitles = await DB.getFileSubtitlesForTrack(trackId)
  const existingNames = existingSubtitles.map((s) => s.name)

  let subName = file.name
  subName = resolveDuplicateName(subName, existingNames)

  const subtitleId = await DB.addSubtitle(text, subName)
  await DB.addFileSubtitle({
    trackId,
    name: subName,
    subtitleId,
  })
  return subtitleId
}

// src/hooks/useFileHandler.ts
// Thin file input handler - delegates all persistence to playerStore
import { useCallback } from 'react'
import { log } from '../lib/logger'
import { usePlayerStore } from '../store/playerStore'

// Allowed audio extensions
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.webm']
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt']

/**
 * Check if a file is an audio file
 */
function isAudioFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

/**
 * Check if a file is a subtitle file
 */
function isSubtitleFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return SUBTITLE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

export function useFileHandler() {
  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const subtitlesLoaded = usePlayerStore((s) => s.subtitlesLoaded)
  const loadAudio = usePlayerStore((s) => s.loadAudio)
  const loadSubtitles = usePlayerStore((s) => s.loadSubtitles)

  /**
   * Process dropped or selected files.
   * All persistence is handled by the store actions - no direct DB calls here.
   */
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        if (isAudioFile(file)) {
          log('[FileHandler] Processing audio file:', file.name)
          // Store handles: blob URL creation, DB persistence, session creation
          loadAudio(file)
        } else if (isSubtitleFile(file)) {
          log('[FileHandler] Processing subtitle file:', file.name)
          // Store handles: parsing, DB persistence, session update
          await loadSubtitles(file)
        }
      }
    },
    [loadAudio, loadSubtitles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('dragover')
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('dragover')
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.currentTarget.classList.remove('dragover')
      processFiles(e.dataTransfer.files)
    },
    [processFiles]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        processFiles(e.target.files)
      }
    },
    [processFiles]
  )

  return {
    audioLoaded,
    subtitlesLoaded,
    processFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileChange,
  }
}

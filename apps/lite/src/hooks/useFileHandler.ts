// src/hooks/useFileHandler.ts
import { useCallback } from 'react'
import { log, error as logError } from '../lib/logger'
import { audioFileSchema, subtitleFileSchema } from '../lib/schemas/fileSchema'
import { toast } from '../lib/toast'
import { usePlayerStore } from '../store/playerStore'

export function useFileHandler() {
  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const subtitlesLoaded = usePlayerStore((s) => s.subtitlesLoaded)
  const loadAudio = usePlayerStore((s) => s.loadAudio)
  const loadSubtitles = usePlayerStore((s) => s.loadSubtitles)

  /**
   * Uses Zod schemas for validation (MIME type and extension).
   */
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        try {
          // 1. Check if it's an audio file
          const audioResult = audioFileSchema.safeParse(file)
          if (audioResult.success) {
            log('[FileHandler] Loading validated audio:', file.name)
            loadAudio(file)
            continue
          }

          // 2. Check if it's a subtitle file
          const subResult = subtitleFileSchema.safeParse(file)
          if (subResult.success) {
            log('[FileHandler] Loading validated subtitle:', file.name)
            await loadSubtitles(file)
            continue
          }

          // 3. Fallback for unsupported files
          log('[FileHandler] Unsupported file ignored:', file.name)
        } catch (err) {
          logError('[FileHandler] Error validating file:', file.name, err)
          toast.errorKey('toastFileValidationError')
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

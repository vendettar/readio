// src/hooks/useFileHandler.ts
import { useCallback } from 'react'
import { log, error as logError } from '../lib/logger'
import {
  createAudioFileSchema,
  createSubtitleFileSchema,
  isValidAudioFile,
  isValidSubtitleFile,
} from '../lib/schemas/files'
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
      const audioSchema = createAudioFileSchema()
      const subtitleSchema = createSubtitleFileSchema()

      for (const file of Array.from(files)) {
        try {
          // 1. Check if it's an audio file
          if (isValidAudioFile(file)) {
            const result = audioSchema.safeParse(file)
            if (result.success) {
              log('[FileHandler] Loading validated audio:', file.name)
              loadAudio(file)
              continue
            }
            const message = result.error.issues[0]?.message
            if (message) toast.error(message)
            else toast.errorKey('toastFileValidationError')
            continue
          }

          // 2. Check if it's a subtitle file
          if (isValidSubtitleFile(file)) {
            const result = subtitleSchema.safeParse(file)
            if (result.success) {
              log('[FileHandler] Loading validated subtitle:', file.name)
              await loadSubtitles(file)
              continue
            }
            const message = result.error.issues[0]?.message
            if (message) toast.error(message)
            else toast.errorKey('toastFileValidationError')
            continue
          }

          // 3. Fallback for unsupported files
          log('[FileHandler] Unsupported file ignored:', file.name)
          toast.errorKey('toastFileValidationError')
        } catch (err) {
          logError('[FileHandler] Error validating file:', file.name, err)
          toast.errorKey('toastFileValidationError')
        }
      }
    },
    [loadAudio, loadSubtitles]
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
    handleFileChange,
  }
}

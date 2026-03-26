// src/hooks/useFileHandler.ts
import { useCallback } from 'react'
import { log, error as logError } from '../lib/logger'
import {
  createAudioFileSchema,
  createSubtitleFileSchema,
  isValidAudioFile,
  isValidSubtitleFile,
} from '../lib/schemas/files'
import { checkStorageQuota, evaluateUploadGuardrails } from '../lib/storageQuota'
import { toast } from '../lib/toast'
import type { TranslationKey } from '../lib/translations'
import { usePlayerStore } from '../store/playerStore'
import { useTranscriptStore } from '../store/transcriptStore'

export function useFileHandler() {
  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const subtitlesLoaded = useTranscriptStore((s) => s.subtitlesLoaded)
  const loadAudio = usePlayerStore((s) => s.loadAudio)
  const loadSubtitles = usePlayerStore((s) => s.loadSubtitles)

  /**
   * Uses Zod schemas for validation (MIME type and extension).
   */
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const audioSchema = createAudioFileSchema()
      const subtitleSchema = createSubtitleFileSchema()
      const list = Array.from(files)

      const { blocked } = await evaluateUploadGuardrails(list)
      if (blocked) {
        return
      }

      let processed = false

      for (const file of list) {
        try {
          // 1. Check if it's an audio file
          if (isValidAudioFile(file)) {
            const result = audioSchema.safeParse(file)
            if (result.success) {
              log('[FileHandler] Loading validated audio:', file.name)
              await loadAudio(file)
              processed = true
              continue
            }
            const messageKey = result.error.issues[0]?.message as TranslationKey | undefined
            if (messageKey) toast.errorKey(messageKey)
            else toast.errorKey('toastFileValidationError')
            continue
          }

          // 2. Check if it's a subtitle file
          if (isValidSubtitleFile(file)) {
            const result = subtitleSchema.safeParse(file)
            if (result.success) {
              log('[FileHandler] Loading validated subtitle:', file.name)
              await loadSubtitles(file)
              processed = true
              continue
            }
            const messageKey = result.error.issues[0]?.message as TranslationKey | undefined
            if (messageKey) toast.errorKey(messageKey)
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

      if (processed) {
        void checkStorageQuota({ mode: 'silent' })
      }
    },
    [loadAudio, loadSubtitles]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget
      const files = input.files

      if (!files) return

      void processFiles(files)
        .catch((err) => {
          logError('[FileHandler] Failed to process selected files', err)
          toast.errorKey('toastUploadFailed')
        })
        .finally(() => {
          input.value = ''
        })
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

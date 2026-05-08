// src/hooks/useFileHandler.ts
import { useCallback } from 'react'
import { processSelectedFiles } from '../lib/fileHandlerService'
import { error as logError } from '../lib/logger'
import { toast } from '../lib/toast'
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
      await processSelectedFiles(files, { loadAudio, loadSubtitles })
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

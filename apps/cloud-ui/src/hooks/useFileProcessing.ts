// src/hooks/useFileProcessing.ts
// Thin wrapper hook for file input handling - delegates to pure ingest module

import { useCallback } from 'react'
import {
  FILE_PROCESSING_RESULT,
  processDroppedFiles,
  processSelectedAudioFiles,
  processSelectedSubtitleFile,
} from '../lib/fileProcessingService'
import { logError } from '../lib/logger'
import { toast } from '../lib/toast'

interface UseFileProcessingOptions {
  currentFolderId: string | null
  onComplete: () => Promise<void>
}

export function useFileProcessing({ currentFolderId, onComplete }: UseFileProcessingOptions) {
  /**
   * Handle files dropped via react-dropzone
   */
  const handleDroppedFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      try {
        const result = await processDroppedFiles(files, currentFolderId)
        if (result === FILE_PROCESSING_RESULT.PROCESSED) {
          await onComplete()
        }
      } catch (err) {
        logError('[Files] Failed to ingest dropped files:', err)
        toast.errorKey('toastUploadFailed')
      }
    },
    [currentFolderId, onComplete]
  )

  /**
   * Handle files selected via file input
   */
  const handleAudioInputChange = useCallback(
    async (
      e: React.ChangeEvent<HTMLInputElement>,
      inputRef: React.RefObject<HTMLInputElement | null>
    ) => {
      if (e.target.files?.length) {
        try {
          const result = await processSelectedAudioFiles(e.target.files, currentFolderId)
          if (result === FILE_PROCESSING_RESULT.PROCESSED) {
            await onComplete()
          }
        } catch (err) {
          logError('[Files] Failed to ingest files:', err)
          toast.errorKey('toastUploadFailed')
        }
      }
      if (inputRef.current) inputRef.current.value = ''
    },
    [currentFolderId, onComplete]
  )

  const handleSubtitleInputChange = useCallback(
    async (
      e: React.ChangeEvent<HTMLInputElement>,
      targetTrackId: string | null,
      inputRef: React.RefObject<HTMLInputElement | null>,
      clearTargetTrackId: () => void
    ) => {
      if (targetTrackId && e.target.files?.length) {
        try {
          const result = await processSelectedSubtitleFile(e.target.files, targetTrackId)
          if (result === FILE_PROCESSING_RESULT.PROCESSED) {
            await onComplete()
          }
        } catch (err) {
          logError('[Files] Failed to attach subtitle:', err)
          toast.errorKey('toastUploadFailed')
        }
      }
      clearTargetTrackId()
      if (inputRef.current) inputRef.current.value = ''
    },
    [onComplete]
  )

  return {
    handleDroppedFiles,
    handleAudioInputChange,
    handleSubtitleInputChange,
  }
}

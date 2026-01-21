// src/hooks/useFileProcessing.ts
// Thin wrapper hook for file input handling - delegates to pure ingest module

import { useCallback } from 'react'
import { attachSubtitleToTrack, ingestFiles } from '../lib/files/ingest'
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
        await ingestFiles({
          files,
          folderId: currentFolderId,
        })
        await onComplete()
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
          await ingestFiles({
            files: Array.from(e.target.files),
            folderId: currentFolderId,
          })
          await onComplete()
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
          await attachSubtitleToTrack(e.target.files[0], targetTrackId)
          await onComplete()
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

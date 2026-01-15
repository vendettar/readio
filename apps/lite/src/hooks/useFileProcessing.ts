// src/hooks/useFileProcessing.ts
// Thin wrapper hook for file input handling - delegates to pure ingest module

import { useCallback } from 'react'
import { attachSubtitleToTrack, ingestFiles } from '../libs/files/ingest'
import { logError } from '../libs/logger'
import { toast } from '../libs/toast'

interface UseFileProcessingOptions {
  currentFolderId: number | null
  onComplete: () => Promise<void>
}

export function useFileProcessing({ currentFolderId, onComplete }: UseFileProcessingOptions) {
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
      targetTrackId: number | null,
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
    handleAudioInputChange,
    handleSubtitleInputChange,
  }
}

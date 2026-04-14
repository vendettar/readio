// src/hooks/useFileProcessing.ts
// Thin wrapper hook for file input handling - delegates to pure ingest module

import { useCallback } from 'react'
import { attachSubtitleToTrack, ingestFiles } from '../lib/files/ingest'
import { logError } from '../lib/logger'
import { isValidAudioFile } from '../lib/schemas/files'
import { checkStorageQuota, evaluateUploadGuardrails } from '../lib/storageQuota'
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
        const { blocked } = await evaluateUploadGuardrails(files)
        if (blocked) {
          return
        }

        await ingestFiles({
          files,
          folderId: currentFolderId,
        })
        // ingestFiles now includes a flush transaction, so all related writes across stores are guaranteed committed
        await onComplete()
        void checkStorageQuota({ mode: 'silent' })
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
          const list = Array.from(e.target.files)
          const hasAudio = list.some((f) => isValidAudioFile(f))

          if (!hasAudio) {
            toast.errorKey('validationInvalidAudioFormat')
            if (inputRef.current) inputRef.current.value = ''
            return
          }

          const { blocked } = await evaluateUploadGuardrails(list)
          if (blocked) {
            if (inputRef.current) inputRef.current.value = ''
            return
          }

          await ingestFiles({
            files: list,
            folderId: currentFolderId,
          })
          // ingestFiles now includes a flush transaction, so all related writes across stores are guaranteed committed
          await onComplete()
          void checkStorageQuota({ mode: 'silent' })
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
          const list = Array.from(e.target.files)
          const { blocked } = await evaluateUploadGuardrails(list)
          if (blocked) {
            clearTargetTrackId()
            if (inputRef.current) inputRef.current.value = ''
            return
          }

          await attachSubtitleToTrack(e.target.files[0], targetTrackId)
          // attachSubtitleToTrack now includes a flush transaction, so all related writes are guaranteed committed
          await onComplete()
          void checkStorageQuota({ mode: 'silent' })
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

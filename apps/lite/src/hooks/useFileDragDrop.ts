// src/hooks/useFileDragDrop.ts

import {
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useCallback, useState } from 'react'
import { DB, type FileTrack } from '../lib/dexieDb'
import { resolveDuplicateName } from '../lib/files/ingest'
import { logError } from '../lib/logger'
import { toast } from '../lib/toast'
import { useI18n } from './useI18n'

interface UseFileDragDropOptions {
  onComplete: () => Promise<void>
}

export function useFileDragDrop({ onComplete }: UseFileDragDropOptions) {
  const { t } = useI18n()
  const [activeDragItem, setActiveDragItem] = useState<FileTrack | null>(null)

  const isDragging = activeDragItem !== null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragItem(event.active.data.current?.track)
    document.body.classList.add('is-dragging')
  }, [])

  const executeMoveTrack = useCallback(
    async (trackId: string, targetFolderId: string | null, currentName: string) => {
      try {
        // Check for duplicates in target folder
        const existingTracks = await DB.getFileTracksInFolder(targetFolderId)
        const existingNames = existingTracks.map((t) => t.name)

        // Resolve name conflict
        const newName = resolveDuplicateName(currentName, existingNames)
        const isRenamed = newName !== currentName

        // Update track
        await DB.updateFileTrack(trackId, {
          folderId: targetFolderId,
          name: newName,
        })

        await onComplete()

        if (isRenamed) {
          toast.success(t('toastMoveRenamed', { name: newName }))
        }
      } catch (err) {
        logError('[Files] Failed to move track', err)
        toast.errorKey('toastMoveFailed')
      }
    },
    [onComplete, t]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragItem(null)
      document.body.classList.remove('is-dragging')
      const { active, over } = event

      if (over && active.data.current?.type === 'track') {
        const track = active.data.current.track as FileTrack
        const trackId = track.id

        if (!trackId) return

        if (over.data.current?.type === 'folder') {
          const targetFolderId = over.data.current.id
          // Avoid moving to same folder
          if (track.folderId !== targetFolderId) {
            await executeMoveTrack(trackId, targetFolderId, track.name)
          }
        }
      }
    },
    [executeMoveTrack]
  )

  const handleDragCancel = useCallback(() => {
    setActiveDragItem(null)
    document.body.classList.remove('is-dragging')
  }, [])

  const handleMoveTo = useCallback(
    async (track: FileTrack, folderId: string | null) => {
      // Avoid moving to same folder
      if (track.folderId === folderId) return

      await executeMoveTrack(track.id, folderId, track.name)
    },
    [executeMoveTrack]
  )

  return {
    sensors,
    activeDragItem,
    isDragging,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    handleMoveTo,
  }
}

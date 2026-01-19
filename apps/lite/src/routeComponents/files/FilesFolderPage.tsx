// src/routes/files/folder/$folderId.tsx

import { DndContext, DragOverlay, type Modifier, useDroppable } from '@dnd-kit/core'
import { useNavigate, useParams } from '@tanstack/react-router'
import { FileAudio, Home, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TrackCard } from '../../components/Files/TrackCard'
import type { ViewDensity } from '../../components/Files/types'
import { ViewControlsBar } from '../../components/Files/ViewControlsBar'
import { Button } from '../../components/ui/button'
import { useFileDragDrop } from '../../hooks/useFileDragDrop'
import { useFilePlayback } from '../../hooks/useFilePlayback'
import { useFileProcessing } from '../../hooks/useFileProcessing'
import { useI18n } from '../../hooks/useI18n'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { DB, type FileFolder, type FileSubtitle, type FileTrack } from '../../lib/dexieDb'
import { logError, warn as logWarn } from '../../lib/logger'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/utils'

const snapCenterCursor: Modifier = ({ transform, activatorEvent, activeNodeRect }) => {
  if (!activatorEvent || !activeNodeRect) return transform

  // Calculate mouse position relative to the source card's top-left
  const clientX =
    'clientX' in activatorEvent
      ? (activatorEvent as MouseEvent).clientX
      : (activatorEvent as TouchEvent).touches?.[0]?.clientX
  const clientY =
    'clientY' in activatorEvent
      ? (activatorEvent as MouseEvent).clientY
      : (activatorEvent as TouchEvent).touches?.[0]?.clientY

  if (clientX === undefined || clientY === undefined) return transform

  return {
    ...transform,
    x: transform.x + (clientX - activeNodeRect.left),
    y: transform.y + (clientY - activeNodeRect.top),
  }
}

// Drop target wrapper for the folder content area
function FolderDropTarget({ folderId, children }: { folderId: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({
    id: `folder-content-${folderId}`,
    data: { type: 'folder-content', folderId },
  })

  return (
    <div
      ref={setNodeRef}
      data-droppable="true"
      className={cn('folder-drop-target min-h-48 rounded-xl transition-colors duration-150')}
    >
      {children}
    </div>
  )
}

// Drop target for the back button to move files back to root
function BackDropTarget({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'back-to-root-target',
    data: { type: 'back-target' },
  })

  return (
    <div
      ref={setNodeRef}
      data-droppable="true"
      className={cn(
        'inline-flex rounded-lg transition-all duration-200',
        isOver && 'bg-primary/10 ring-2 ring-primary/50 shadow-md scale-105'
      )}
    >
      {children}
    </div>
  )
}

export default function FilesFolderPage() {
  const { folderId } = useParams({ from: '/files/folder/$folderId' })
  const navigate = useNavigate()
  const { t } = useI18n()
  useKeyboardShortcuts({ isModalOpen: false })

  // folderId is now a string UUID from the route
  const folderIdIsValid = folderId && folderId.length > 0

  // Data state
  const [folder, setFolder] = useState<FileFolder | null>(null)
  const [tracks, setTracks] = useState<FileTrack[]>([])
  const [subtitles, setSubtitles] = useState<FileSubtitle[]>([])
  const [folders, setFolders] = useState<FileFolder[]>([])
  const [lastPlayedMap, setLastPlayedMap] = useState<Record<string, number>>({})

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [folderData, allFolders, allTracks, sessions] = await Promise.all([
        DB.getFolder(folderId),
        DB.getAllFolders(),
        DB.getAllFileTracks(),
        DB.getAllPlaybackSessions(),
      ])

      if (!folderData) {
        navigate({ to: '/files', replace: true })
        return
      }

      setFolder(folderData)
      setFolders(allFolders)

      // Filter tracks to this folder
      const folderTracks = allTracks.filter((t: FileTrack) => t.folderId === folderId)
      setTracks(folderTracks)

      // Load subtitles for filter tracks
      const subsPromises = folderTracks.map((t: FileTrack) => DB.getFileSubtitlesForTrack(t.id))
      const subsArrays = await Promise.all(subsPromises)
      setSubtitles(subsArrays.flat())

      // Build lastPlayedMap
      const playedMap: Record<string, number> = {}
      for (const s of sessions) {
        if (s.audioId && s.lastPlayedAt) {
          playedMap[s.audioId] = s.lastPlayedAt
        }
      }
      setLastPlayedMap(playedMap)
    } catch (error) {
      logError('[FolderView] Failed to load data', error)
    }
  }, [navigate, folderId])

  useEffect(() => {
    if (!folderIdIsValid) {
      navigate({ to: '/files', replace: true })
      return
    }
    window.requestAnimationFrame(() => {
      void loadData()
    })
  }, [loadData, folderIdIsValid, navigate])

  // Density state
  const [density, setDensity] = useState<ViewDensity>('comfortable')

  const loadDensity = useCallback(async () => {
    const saved = await DB.getSetting('files.viewDensity')
    if (saved === 'compact') setDensity('compact')
  }, [])

  useEffect(() => {
    window.requestAnimationFrame(() => {
      void loadDensity()
    })
  }, [loadDensity])

  const handleDensityChange = useCallback(async (value: ViewDensity) => {
    setDensity(value)
    try {
      await DB.setSetting('files.viewDensity', value)
    } catch (err) {
      logWarn('[FolderView] Failed to persist density setting', err)
    }
  }, [])

  // File processing - uploads go to this folder
  const { handleAudioInputChange, handleSubtitleInputChange } = useFileProcessing({
    currentFolderId: folderId,
    onComplete: loadData,
  })

  // Drag & Drop
  const {
    sensors,
    activeDragItem,
    isDragging,
    handleDragStart,
    handleDragEnd: originalHandleDragEnd,
    handleDragCancel,
    handleMoveTo,
  } = useFileDragDrop({ onComplete: loadData })

  // Custom drag end to handle drops into this folder view
  const handleDragEnd = useCallback(
    (event: Parameters<typeof originalHandleDragEnd>[0]) => {
      const { over, active } = event

      if (active?.data?.current?.type === 'track') {
        const trackId = active.data.current.track.id as string

        // Move back to root
        if (over?.data?.current?.type === 'back-target') {
          void (async () => {
            try {
              await DB.updateFileTrack(trackId, { folderId: null })
              await loadData()
            } catch (err) {
              logError('[FolderView] Failed to move track to root', err)
            }
          })()
        }
        // Move into this folder (it's already here, but ensures consistency)
        else if (over?.data?.current?.type === 'folder-content') {
          void (async () => {
            try {
              await DB.updateFileTrack(trackId, { folderId })
              await loadData()
            } catch (err) {
              logError('[FolderView] Failed to move track into folder', err)
            }
          })()
        }
      }

      // Always use original handler to ensure state cleanup (activeDragItem, etc.)
      void originalHandleDragEnd(event)
    },
    [originalHandleDragEnd, folderId, loadData]
  )

  // File input refs
  const audioInputRef = useRef<HTMLInputElement>(null)
  const subtitleInputRef = useRef<HTMLInputElement>(null)
  const [targetTrackId, setTargetTrackId] = useState<string | null>(null)
  // Note: track delete confirmation is handled by TrackOverflowMenu (secondary popover).

  // Playback logic refactored into hook
  const { handlePlay, handleSetActiveSubtitle } = useFilePlayback({ onComplete: loadData })

  const existingTrackNames = tracks?.map((t) => t.name) || []

  const handleBack = useCallback(() => {
    navigate({ to: '/files' })
  }, [navigate])

  // Redirect if folder not found
  if (folder === null && tracks.length === 0) {
    // Still loading or folder doesn't exist
  }

  const itemCount = tracks.length

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="px-page pt-page pb-32 max-w-content mx-auto min-h-full">
        {/* Header */}
        <header className="mb-8">
          {/* Back button row */}
          <div className="mb-4">
            <BackDropTarget>
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={isDragging}
                className="gap-2 text-muted-foreground hover:text-foreground -ml-3"
              >
                <Home size={18} />
                <span>{t('filesBackToRoot')}</span>
              </Button>
            </BackDropTarget>
          </div>

          {/* Title row */}
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-4xl font-bold text-foreground tracking-tight">
                {folder?.name || t('loading')}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t('filesItemCount', { count: itemCount })}
              </p>
            </div>

            <Button onClick={() => audioInputRef.current?.click()} className="gap-2">
              <Upload size={18} />
              <span>{t('filesAddAudio')}</span>
            </Button>
          </div>
        </header>

        {/* View Controls Bar */}
        <ViewControlsBar density={density} onDensityChange={handleDensityChange} />

        {/* Hidden file inputs */}
        <input
          type="file"
          accept=".srt,.vtt"
          ref={subtitleInputRef}
          onChange={(e) =>
            handleSubtitleInputChange(e, targetTrackId, subtitleInputRef, () =>
              setTargetTrackId(null)
            )
          }
          className="hidden"
        />
        <input
          type="file"
          accept="audio/*"
          multiple
          ref={audioInputRef}
          onChange={(e) => handleAudioInputChange(e, audioInputRef)}
          className="hidden"
        />

        {/* Folder Content as Drop Target */}
        <FolderDropTarget folderId={folderId}>
          <div className="space-y-8 pb-20">
            {/* Tracks List */}
            {tracks.length > 0 ? (
              <div className={density === 'compact' ? 'space-y-2' : 'space-y-4'}>
                {tracks.map((track) => {
                  const trackSubs = subtitles.filter((s) => s.trackId === track.id)

                  return (
                    <TrackCard
                      key={track.id}
                      track={track}
                      subtitles={trackSubs}
                      folders={folders}
                      density={density}
                      lastPlayedAt={track.audioId ? lastPlayedMap[track.audioId] : undefined}
                      isGlobalDragging={isDragging}
                      existingTrackNames={existingTrackNames}
                      onPlay={(t, s) => handlePlay(t, subtitles, s)}
                      onSetActiveSubtitle={handleSetActiveSubtitle}
                      onRename={async (newName) => {
                        if (!track.id) return
                        try {
                          await DB.updateFileTrack(track.id, { name: newName })
                          await loadData()
                        } catch (err) {
                          logError('[FolderView] Failed to rename track', err)
                          toast.errorKey('toastRenameFailed')
                        }
                      }}
                      onDeleteTrack={async () => {
                        if (!track.id) return false
                        try {
                          await DB.deleteFileTrack(track.id)
                          await loadData()
                          return true
                        } catch (err) {
                          logError('[FolderView] Failed to delete track', err)
                          toast.errorKey('toastDeleteFailed')
                          return false
                        }
                      }}
                      onDeleteSub={(id) => DB.deleteFileSubtitle(id).then(loadData)}
                      onAddSub={() => {
                        if (!track.id) return
                        setTargetTrackId(track.id)
                        subtitleInputRef.current?.click()
                      }}
                      onMove={(folderId) => handleMoveTo(track, folderId)}
                    />
                  )
                })}
              </div>
            ) : (
              /* Empty state - calm, neutral */
              <div className="text-center py-16 px-8 rounded-xl">
                <p className="text-lg font-medium text-muted-foreground mb-2">
                  {t('folderEmptyTitle')}
                </p>
                <p className="text-sm text-muted-foreground/70">{t('folderEmptyHint')}</p>
              </div>
            )}
          </div>
        </FolderDropTarget>

        <DragOverlay dropAnimation={null} modifiers={[snapCenterCursor]}>
          {activeDragItem ? (
            <div
              className={cn(
                'bg-card border border-primary shadow-xl rounded-lg w-40 flex items-center opacity-95 pointer-events-none -translate-x-1/2 -translate-y-1/2',
                density === 'compact' ? 'p-2 gap-2' : 'p-2.5 gap-2.5'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0 bg-muted flex items-center justify-center text-muted-foreground',
                  density === 'compact' ? 'w-6 h-6 rounded-md' : 'w-7 h-7 rounded-md'
                )}
              >
                <FileAudio size={density === 'compact' ? 12 : 14} />
              </div>
              <span
                className={cn(
                  'min-w-0 flex-1 text-foreground font-semibold leading-tight whitespace-normal break-words overflow-hidden',
                  density === 'compact' ? 'text-xs max-h-8' : 'text-xs max-h-9'
                )}
              >
                {activeDragItem.name}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  )
}

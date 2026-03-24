// src/routes/files/folder/$folderId.tsx

import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { useNavigate, useParams } from '@tanstack/react-router'
import { FileAudio, Home, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDropZone } from '../../components/Files/FileDropZone'
import { TrackCard } from '../../components/Files/TrackCard'
import type { ViewDensity } from '../../components/Files/types'
import { ViewControlsBar } from '../../components/Files/ViewControlsBar'
import { PageHeader, PageShell } from '../../components/layout'
import { Button } from '../../components/ui/button'
import { HiddenFileInput } from '../../components/ui/hidden-file-input'
import { useFileDragDrop } from '../../hooks/useFileDragDrop'
import { useFilePlayback } from '../../hooks/useFilePlayback'
import { useFileProcessing } from '../../hooks/useFileProcessing'
import type { FileFolder, FileSubtitle, FileTrack } from '../../lib/db/types'
import { snapCenterCursor } from '../../lib/dnd/modifiers'
import { getDragPreviewWidthClass } from '../../lib/dnd/previewSizing'
import { logError, warn as logWarn } from '../../lib/logger'
import {
  RETRANSCRIBE_FILE_REASON,
  retranscribeFileTrackWithCurrentSettings,
} from '../../lib/remoteTranscript'
import { AUDIO_EXTENSIONS, SUBTITLE_EXTENSIONS } from '../../lib/schemas/files'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/utils'
import { useFilesStore } from '../../store/filesStore'

export function groupSubtitlesByTrackId(subtitles: FileSubtitle[]): Record<string, FileSubtitle[]> {
  const grouped: Record<string, FileSubtitle[]> = {}
  for (const subtitle of subtitles) {
    if (!grouped[subtitle.trackId]) {
      grouped[subtitle.trackId] = []
    }
    grouped[subtitle.trackId].push(subtitle)
  }
  return grouped
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
  const { t } = useTranslation()

  // folderId is now a string UUID from the route
  const folderIdIsValid = folderId && folderId.length > 0

  // Data state
  const [folder, setFolder] = useState<FileFolder | null>(null)
  const [tracks, setTracks] = useState<FileTrack[]>([])
  const [subtitles, setSubtitles] = useState<FileSubtitle[]>([])
  const [folders, setFolders] = useState<FileFolder[]>([])

  // Files store for DB operations
  const getFolder = useFilesStore((s) => s.getFolder)
  const getSetting = useFilesStore((s) => s.getSetting)
  const setSetting = useFilesStore((s) => s.setSetting)
  const getArtworkBlob = useFilesStore((s) => s.getAudioBlob)
  const updateFileTrack = useFilesStore((s) => s.updateFileTrack)
  const deleteFileTrack = useFilesStore((s) => s.deleteFileTrack)
  const deleteFileSubtitle = useFilesStore((s) => s.deleteFileSubtitle)
  const loadAllFolders = useFilesStore((s) => s.loadAllFolders)
  const loadAllTracks = useFilesStore((s) => s.loadAllTracks)
  const getFileSubtitlesForTrack = useFilesStore((s) => s.getFileSubtitlesForTrack)

  // Guard: request ID counter to prevent stale updates
  const requestIdRef = useRef(0)

  // Load data
  const loadData = useCallback(async () => {
    requestIdRef.current += 1
    const thisRequestId = requestIdRef.current

    try {
      const [folderData, allFolders, allTracks] = await Promise.all([
        getFolder(folderId),
        loadAllFolders(),
        loadAllTracks(),
      ])

      if (thisRequestId !== requestIdRef.current) return

      if (!folderData) {
        void navigate({ to: '/files', replace: true })
        return
      }

      setFolder(folderData)
      setFolders(allFolders)

      // Filter tracks to this folder
      const folderTracks = allTracks.filter((t: FileTrack) => t.folderId === folderId)
      setTracks(folderTracks)

      // Load subtitles for filter tracks
      const subsPromises = folderTracks.map((t: FileTrack) => getFileSubtitlesForTrack(t.id))
      const subsArrays = await Promise.all(subsPromises)

      if (thisRequestId !== requestIdRef.current) return
      setSubtitles(subsArrays.flat())
    } catch (error) {
      logError('[FolderView] Failed to load data', error)
    }
  }, [navigate, folderId, getFolder, loadAllFolders, loadAllTracks, getFileSubtitlesForTrack])

  useEffect(() => {
    if (!folderIdIsValid) {
      void navigate({ to: '/files', replace: true })
      return
    }
    const raf = window.requestAnimationFrame(() => {
      void loadData()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [loadData, folderIdIsValid, navigate])

  // Density state
  const [density, setDensity] = useState<ViewDensity>('comfortable')

  const loadDensity = useCallback(async () => {
    const saved = await getSetting('files.viewDensity')
    if (saved === 'compact') setDensity('compact')
  }, [getSetting])

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      void loadDensity()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [loadDensity])

  const handleDensityChange = useCallback(
    async (value: ViewDensity) => {
      setDensity(value)
      try {
        await setSetting('files.viewDensity', value)
      } catch (err) {
        logWarn('[FolderView] Failed to persist density setting', err)
      }
    },
    [setSetting]
  )

  // File processing - uploads go to this folder
  const { handleDroppedFiles, handleAudioInputChange, handleSubtitleInputChange } =
    useFileProcessing({
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
  const dragPreviewWidthClass = getDragPreviewWidthClass(density)

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
              await updateFileTrack(trackId, { folderId: null })
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
              await updateFileTrack(trackId, { folderId })
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
    [originalHandleDragEnd, folderId, loadData, updateFileTrack]
  )

  // File input refs
  const audioInputRef = useRef<HTMLInputElement>(null)
  const subtitleInputRef = useRef<HTMLInputElement>(null)
  const [targetTrackId, setTargetTrackId] = useState<string | null>(null)
  // Note: track delete confirmation is handled by TrackOverflowMenu (secondary popover).

  // Playback logic refactored into hook
  const { handlePlay, handleSetActiveSubtitle } = useFilePlayback({ onComplete: loadData })

  const handleTranscribeTrack = useCallback(
    async (trackId: string) => {
      const result = await retranscribeFileTrackWithCurrentSettings(trackId)
      if (!result.ok) {
        if (result.reason === RETRANSCRIBE_FILE_REASON.UNCONFIGURED) {
          toast.errorKey('asrKeyInvalid')
          window.dispatchEvent(
            new CustomEvent('readio:navigate', {
              detail: { to: '/settings', hash: 'asr' },
            })
          )
        }
        return
      }
      await loadData()
    },
    [loadData]
  )

  const existingTrackNames = tracks?.map((t) => t.name) || []
  const subtitlesByTrackId = useMemo(() => groupSubtitlesByTrackId(subtitles), [subtitles])

  // Artwork Blob management
  const [artworkBlobs, setArtworkBlobs] = useState<Record<string, Blob>>({})

  // Fetch artwork blobs
  useEffect(() => {
    if (!tracks || tracks.length === 0) return

    let cancelled = false
    const blobs: Record<string, Blob> = {}

    const fetchArtworks = async () => {
      for (const track of tracks) {
        if (!track.artworkId) continue
        // Skip if we already have it
        if (artworkBlobs[track.id]) continue

        try {
          const blob = await getArtworkBlob(track.artworkId)
          if (cancelled) return
          if (blob) {
            blobs[track.id] = blob
          }
        } catch (err) {
          logWarn('[FolderView] Failed to fetch artwork blob', err)
        }
      }
      if (!cancelled && Object.keys(blobs).length > 0) {
        setArtworkBlobs((prev) => ({ ...prev, ...blobs }))
      }
    }

    void fetchArtworks()

    return () => {
      cancelled = true
    }
  }, [tracks, artworkBlobs, getArtworkBlob])

  const handleBack = useCallback(() => {
    void navigate({ to: '/files' })
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
      <FileDropZone onFilesAccepted={handleDroppedFiles} className="min-h-full">
        <PageShell contentClassName="pb-32">
          <PageHeader
            beforeTitle={
              <BackDropTarget>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  disabled={isDragging}
                  className="gap-2 text-muted-foreground hover:text-foreground -ms-1 sm:-ms-3"
                >
                  <Home size={18} />
                  <span>{t('filesBackToRoot')}</span>
                </Button>
              </BackDropTarget>
            }
            title={folder?.name || t('loading')}
            subtitle={t('filesItemCount', { count: itemCount })}
            actions={
              <Button
                type="button"
                data-testid="add-audio-btn"
                onClick={() => audioInputRef.current?.click()}
                className="gap-2"
              >
                <Upload size={18} />
                <span>{t('filesAddAudio')}</span>
              </Button>
            }
          />

          {/* View Controls Bar */}
          <ViewControlsBar density={density} onDensityChange={handleDensityChange} />

          {/* Hidden file inputs */}
          <HiddenFileInput
            accept={SUBTITLE_EXTENSIONS.join(',')}
            ref={subtitleInputRef}
            onChange={(e) =>
              handleSubtitleInputChange(e, targetTrackId, subtitleInputRef, () =>
                setTargetTrackId(null)
              )
            }
          />
          <HiddenFileInput
            accept={`audio/*,${AUDIO_EXTENSIONS.join(',')}`}
            multiple
            data-testid="audio-file-input"
            ref={audioInputRef}
            onChange={(e) => handleAudioInputChange(e, audioInputRef)}
          />

          {/* Folder Content as Drop Target */}
          <FolderDropTarget folderId={folderId}>
            <div className="space-y-8 pb-20">
              {/* Tracks List */}
              {tracks.length > 0 ? (
                <div className={density === 'compact' ? 'space-y-2' : 'space-y-4'}>
                  {tracks.map((track) => {
                    const trackSubs = subtitlesByTrackId[track.id] ?? []

                    return (
                      <TrackCard
                        key={track.id}
                        track={track}
                        subtitles={trackSubs}
                        folders={folders}
                        density={density}
                        isGlobalDragging={isDragging}
                        existingTrackNames={existingTrackNames}
                        artworkBlob={artworkBlobs[track.id]}
                        onPlay={(t, s) => handlePlay(t, subtitles, s)}
                        onSetActiveSubtitle={handleSetActiveSubtitle}
                        onTranscribe={() => handleTranscribeTrack(track.id)}
                        onRename={async (newName) => {
                          if (!track.id) return
                          try {
                            await updateFileTrack(track.id, { name: newName })
                            await loadData()
                          } catch (err) {
                            logError('[FolderView] Failed to rename track', err)
                            toast.errorKey('toastRenameFailed')
                          }
                        }}
                        onDeleteTrack={async () => {
                          if (!track.id) return false
                          try {
                            await deleteFileTrack(track.id)
                            await loadData()
                            return true
                          } catch (err) {
                            logError('[FolderView] Failed to delete track', err)
                            toast.errorKey('toastDeleteFailed')
                            return false
                          }
                        }}
                        onDeleteSub={async (id) => {
                          try {
                            await deleteFileSubtitle(id)
                            await loadData()
                            return true
                          } catch (err) {
                            logError('[FolderView] Failed to delete subtitle', err)
                            toast.errorKey('toastDeleteFailed')
                            return false
                          }
                        }}
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
                  'bg-card border border-primary shadow-xl rounded-lg flex items-center opacity-95 pointer-events-none -translate-x-1/2 -translate-y-1/2',
                  dragPreviewWidthClass,
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
        </PageShell>
      </FileDropZone>
    </DndContext>
  )
}

import { DndContext, DragOverlay, type Modifier } from '@dnd-kit/core'
import { useNavigate } from '@tanstack/react-router'
import { Check, FileAudio, Home, Plus, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDropZone } from '../../components/Files/FileDropZone'
import { FolderCard } from '../../components/Files/FolderCard'
import { TrackCard } from '../../components/Files/TrackCard'
import type { ViewDensity } from '../../components/Files/types'
import { ViewControlsBar } from '../../components/Files/ViewControlsBar'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { useFileDragDrop } from '../../hooks/useFileDragDrop'
import { useFilePlayback } from '../../hooks/useFilePlayback'
import { useFileProcessing } from '../../hooks/useFileProcessing'
import { useFilesData } from '../../hooks/useFilesData'
import { useFolderManagement } from '../../hooks/useFolderManagement'

import { DB } from '../../lib/dexieDb'
import { sortFolders } from '../../lib/files/sortFolders'
import { logError, warn as logWarn } from '../../lib/logger'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/utils'

const snapCenterCursor: Modifier = ({ transform, activatorEvent, activeNodeRect }) => {
  if (!activatorEvent || !activeNodeRect) return transform

  // Calculate position regardless of device (mouse or touch)
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

export default function FilesIndexPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Data management
  const {
    folders,
    tracks,
    subtitles,
    currentFolder,
    currentFolderId,
    setCurrentFolderId,
    lastPlayedMap,
    folderCounts,
    loadData,
    status,
  } = useFilesData()

  // Load data on mount and when folder changes
  useEffect(() => {
    void loadData()
  }, [loadData])

  // Density state with persistence
  const [density, setDensity] = useState<ViewDensity>('comfortable')

  const loadDensity = useCallback(async () => {
    const saved = await DB.getSetting('files.viewDensity')
    if (saved === 'compact') setDensity('compact')
  }, [])

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      void loadDensity()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [loadDensity])

  const handleDensityChange = useCallback(async (value: ViewDensity) => {
    setDensity(value)
    try {
      await DB.setSetting('files.viewDensity', value)
    } catch (err) {
      logWarn('[Files] Failed to persist density setting', err)
    }
  }, [])

  // File processing
  const { handleDroppedFiles, handleAudioInputChange, handleSubtitleInputChange } =
    useFileProcessing({
      currentFolderId,
      onComplete: loadData,
    })

  // Drag & Drop
  const {
    sensors,
    activeDragItem,
    isDragging,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    handleMoveTo,
  } = useFileDragDrop({ onComplete: loadData })

  const [dragPreviewWidthPx, setDragPreviewWidthPx] = useState<number | null>(null)

  const [folderCardWidthPx, setFolderCardWidthPx] = useState<number | null>(null)
  const [folderMeasureEl, setFolderMeasureEl] = useState<HTMLDivElement | null>(null)

  const folderMeasureRef = useCallback((node: HTMLDivElement | null) => {
    setFolderMeasureEl(node)
  }, [])

  useEffect(() => {
    if (!folderMeasureEl) return

    const raf = window.requestAnimationFrame(() => {
      setFolderCardWidthPx(folderMeasureEl.offsetWidth || null)
    })

    if (typeof ResizeObserver === 'undefined') {
      return () => window.cancelAnimationFrame(raf)
    }

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      setFolderCardWidthPx(width > 0 ? width : null)
    })

    ro.observe(folderMeasureEl)
    return () => {
      window.cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [folderMeasureEl])

  const getDragPreviewWidthPx = useCallback(() => {
    if (!folderCardWidthPx) return null
    const paddingDelta = density === 'compact' ? 8 : 12
    return Math.max(140, Math.round(folderCardWidthPx - paddingDelta))
  }, [density, folderCardWidthPx])

  const handleDragStartWithPreview = useCallback(
    (event: Parameters<typeof handleDragStart>[0]) => {
      setDragPreviewWidthPx(getDragPreviewWidthPx())
      handleDragStart(event)
    },
    [getDragPreviewWidthPx, handleDragStart]
  )

  const handleDragEndWithPreview = useCallback(
    (event: Parameters<typeof handleDragEnd>[0]) => {
      setDragPreviewWidthPx(null)
      void handleDragEnd(event)
    },
    [handleDragEnd]
  )

  const handleDragCancelWithPreview = useCallback(() => {
    setDragPreviewWidthPx(null)
    handleDragCancel()
  }, [handleDragCancel])

  // Folder management
  const {
    isNamingFolder,
    setIsNamingFolder,
    newFolderName,
    setNewFolderName,
    namingInputRef,
    namingContainerRef,
    handleCreateFolder,
    handleConfirmNewFolder,
    executeDeleteFolder,
  } = useFolderManagement({
    setCurrentFolderId,
    onComplete: loadData,
    folders: folders || [],
  })

  // File input refs
  const audioInputRef = useRef<HTMLInputElement>(null)
  const subtitleInputRef = useRef<HTMLInputElement>(null)
  const [targetTrackId, setTargetTrackId] = useState<string | null>(null)
  // Note: track delete confirmation is handled by TrackOverflowMenu (secondary popover).

  // Playback logic refactored into hook
  const { handlePlay, handleSetActiveSubtitle } = useFilePlayback({ onComplete: loadData })

  const existingTrackNames = tracks?.map((t) => t.name) || []
  const isInitialLoading = status === 'loading' && !folders?.length && !tracks?.length

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
          const blob = await DB.getAudioBlob(track.artworkId)
          if (cancelled) return
          if (blob) {
            blobs[track.id] = blob.blob
          }
        } catch (err) {
          logWarn('[Files] Failed to fetch artwork blob', err)
        }
      }
      if (!cancelled && Object.keys(blobs).length > 0) {
        setArtworkBlobs((prev) => ({ ...prev, ...blobs }))
      }
    }

    fetchArtworks()

    return () => {
      cancelled = true
    }
  }, [tracks, artworkBlobs])

  const folderSkeletonKeys = [
    'folder-skeleton-1',
    'folder-skeleton-2',
    'folder-skeleton-3',
    'folder-skeleton-4',
    'folder-skeleton-5',
  ]
  const trackSkeletonKeys = [
    'track-skeleton-1',
    'track-skeleton-2',
    'track-skeleton-3',
    'track-skeleton-4',
  ]

  const renderFolderSkeleton = () => (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
      {folderSkeletonKeys.map((key) => (
        <div
          key={key}
          className="rounded-xl border border-border bg-card/60 animate-pulse p-4 h-32"
        />
      ))}
    </div>
  )

  const renderTrackSkeleton = () => (
    <div className="space-y-3">
      {trackSkeletonKeys.map((key) => (
        <div key={key} className="rounded-xl border border-border bg-card/60 animate-pulse h-24" />
      ))}
    </div>
  )

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStartWithPreview}
      onDragEnd={handleDragEndWithPreview}
      onDragCancel={handleDragCancelWithPreview}
    >
      <FileDropZone onFilesAccepted={handleDroppedFiles} className="min-h-full">
        <div className="px-page pt-page pb-32 max-w-content mx-auto min-h-full">
          {/* Header */}
          <header className="mb-8 flex items-end justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl font-bold text-foreground tracking-tight">
                {currentFolder ? currentFolder.name : t('filesTitle')}
              </h1>
              {!currentFolder && (
                <p className="text-muted-foreground text-sm">{t('filesSubtitle')}</p>
              )}
            </div>

            <div className="flex items-start gap-3">
              {currentFolderId === null && (
                <Button variant="secondary" onClick={handleCreateFolder} className="gap-2">
                  <Plus size={18} />
                  <span>{t('filesNewFolder')}</span>
                </Button>
              )}
              <Button
                data-testid="add-audio-btn"
                onClick={() => audioInputRef.current?.click()}
                className="gap-2"
              >
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
            accept="audio/*,.srt,.vtt"
            multiple
            data-testid="audio-file-input"
            ref={audioInputRef}
            onChange={(e) => handleAudioInputChange(e, audioInputRef)}
            className="hidden"
          />

          <div className="space-y-8 pb-20">
            {isInitialLoading && (
              <>
                {currentFolderId === null && renderFolderSkeleton()}
                {renderTrackSkeleton()}
              </>
            )}
            {/* Folders Grid (Only in Root) */}
            {!isInitialLoading && currentFolderId === null && (
              <div>
                {((folders && folders.length > 0) || isNamingFolder) && (
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                      {t('filesFolders')}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('filesFolderHelperText')}
                    </p>
                  </div>
                )}

                <div
                  className={cn(
                    'grid gap-4',
                    density === 'compact'
                      ? 'grid-cols-3 md:grid-cols-5 lg:grid-cols-7'
                      : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5'
                  )}
                >
                  {/* Inline New Folder Input */}
                  {isNamingFolder && (
                    <div
                      ref={namingContainerRef}
                      className="group flex flex-col items-center justify-center p-6 rounded-xl border border-primary bg-primary/5 shadow-sm transition-all duration-200 relative"
                    >
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3 bg-primary/20 text-primary">
                        <Plus size={24} />
                      </div>
                      <Input
                        ref={namingInputRef}
                        type="text"
                        placeholder={t('filesFolderName')}
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmNewFolder()
                          if (e.key === 'Escape') setIsNamingFolder(false)
                        }}
                        onBlur={handleConfirmNewFolder}
                        className="text-center"
                      />
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="icon"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleConfirmNewFolder}
                          className="h-8 w-8"
                        >
                          <Check size={14} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setIsNamingFolder(false)}
                          className="h-8 w-8"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </div>
                  )}

                  {sortFolders(folders).map((folder, index) => {
                    return (
                      <FolderCard
                        key={folder.id}
                        folder={folder}
                        itemCount={folderCounts[folder.id] || 0}
                        density={density}
                        isDragging={isDragging}
                        measureRef={index === 0 ? folderMeasureRef : undefined}
                        onClick={() => {
                          if (!folder.id) return
                          navigate({
                            to: '/files/folder/$folderId',
                            params: { folderId: String(folder.id) },
                          })
                        }}
                        onPin={async () => {
                          if (!folder.id) return
                          await DB.updateFolder(folder.id, { pinnedAt: Date.now() })
                          loadData()
                        }}
                        onUnpin={async () => {
                          if (!folder.id) return
                          await DB.updateFolder(folder.id, { pinnedAt: undefined })
                          loadData()
                        }}
                        existingFolderNames={folders?.map((f) => f.name)}
                        onRename={async (newName) => {
                          if (!folder.id) return
                          await DB.updateFolder(folder.id, { name: newName })
                          loadData()
                        }}
                        onDelete={() => executeDeleteFolder(folder)}
                        isDropDisabled={!activeDragItem}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* Back to Root Button */}
            {!isInitialLoading && currentFolderId !== null && (
              <Button
                variant="ghost"
                className="p-4 rounded-xl border border-dashed border-border text-muted-foreground flex items-center justify-center gap-2 hover:bg-muted hover:border-muted-foreground/30 transition-colors"
                onClick={() => setCurrentFolderId(null)}
              >
                <Home size={18} />
                <span className="font-medium">{t('filesBackToRoot')}</span>
              </Button>
            )}

            {/* Tracks List */}
            {!isInitialLoading && (
              <div>
                {/* Only show FILES title when we are at root AND folders exist (to distinguish sections) */}
                {tracks &&
                  tracks.length > 0 &&
                  currentFolderId === null &&
                  folders &&
                  folders.length > 0 && (
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">
                      {t('filesFiles')}
                    </h2>
                  )}
                {tracks && tracks.length > 0 ? (
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
                          artworkBlob={artworkBlobs[track.id]}
                          onPlay={(t, s) => handlePlay(t, subtitles, s)}
                          onSetActiveSubtitle={handleSetActiveSubtitle}
                          onRename={async (newName) => {
                            if (!track.id) return
                            try {
                              await DB.updateFileTrack(track.id, { name: newName })
                              await loadData()
                            } catch (err) {
                              logError('[Files] Failed to rename track', err)
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
                              logError('[Files] Failed to delete track', err)
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
                  // Only show EmptyState if we are inside a folder OR if (at root and no folders)
                  // This hides the "Start building..." message when user has collections but no root files
                  (!folders || folders.length === 0 || currentFolderId !== null) && (
                    <EmptyState
                      icon={Upload}
                      title={
                        currentFolderId !== null ? t('filesEmptyFolder') : t('filesEmptyHeadline')
                      }
                      description={currentFolderId !== null ? undefined : t('filesEmptyBody')}
                      action={
                        <Button onClick={() => audioInputRef.current?.click()}>
                          <Upload className="w-4 h-4 mr-2" />
                          {t('filesUpload')}
                        </Button>
                      }
                    />
                  )
                )}
              </div>
            )}
          </div>

          <DragOverlay dropAnimation={null} modifiers={[snapCenterCursor]}>
            {activeDragItem ? (
              <div
                className={cn(
                  'bg-card border border-primary shadow-xl rounded-xl w-[var(--drag-preview-w)] flex items-center opacity-90 pointer-events-none -translate-x-1/2 -translate-y-1/2',
                  density === 'compact' ? 'p-2.5 gap-2.5' : 'p-3 gap-3'
                )}
                style={
                  { '--drag-preview-w': `${dragPreviewWidthPx ?? 280}px` } as React.CSSProperties
                }
              >
                <div
                  className={cn(
                    'flex-shrink-0 bg-muted flex items-center justify-center text-muted-foreground',
                    density === 'compact' ? 'w-7 h-7 rounded-md' : 'w-8 h-8 rounded-lg'
                  )}
                >
                  <FileAudio size={density === 'compact' ? 14 : 16} />
                </div>
                <span
                  className={cn(
                    'min-w-0 flex-1 text-foreground font-semibold leading-tight whitespace-normal break-words overflow-hidden',
                    density === 'compact' ? 'text-xs max-h-9' : 'text-sm max-h-10'
                  )}
                >
                  {activeDragItem.name}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </div>
      </FileDropZone>
    </DndContext>
  )
}

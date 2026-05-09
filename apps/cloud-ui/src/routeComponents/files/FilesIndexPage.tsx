import { DndContext, DragOverlay } from '@dnd-kit/core'
import { Plus, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDragPreview } from '../../components/Files/FileDragPreview'
import { FileDropZone } from '../../components/Files/FileDropZone'
import { FilesLoadingSkeletons } from '../../components/Files/FilesLoadingSkeletons'
import { FoldersGridSection } from '../../components/Files/FoldersGridSection'
import { TracksListSection } from '../../components/Files/TracksListSection'
import { ViewControlsBar } from '../../components/Files/ViewControlsBar'
import { PageHeader, PageShell } from '../../components/layout'
import { Button } from '../../components/ui/button'
import { HiddenFileInput } from '../../components/ui/hidden-file-input'
import { useFileDragDrop } from '../../hooks/useFileDragDrop'
import { useFilePlayback } from '../../hooks/useFilePlayback'
import { useFileProcessing } from '../../hooks/useFileProcessing'
import { useFilesData } from '../../hooks/useFilesData'
import { useFolderManagement } from '../../hooks/useFolderManagement'
import { useViewDensity } from '../../hooks/useViewDensity'
import { snapCenterCursor } from '../../lib/dnd/modifiers'
import { getDragPreviewWidthClass } from '../../lib/dnd/previewSizing'
import { logError, warn as logWarn } from '../../lib/logger'
import {
  RETRANSCRIBE_FILE_REASON,
  retranscribeFileTrackWithCurrentSettings,
} from '../../lib/remoteTranscript'
import { AUDIO_EXTENSIONS, SUBTITLE_EXTENSIONS } from '../../lib/schemas/files'
import { toast } from '../../lib/toast'
import { useFilesStore } from '../../store/filesStore'

export default function FilesIndexPage() {
  const { t } = useTranslation()
  const currentFolderId = null

  const { folders, tracks, subtitles, folderCounts, loadData, status } = useFilesData(null)

  useEffect(() => {
    void loadData()
  }, [loadData])

  const getArtworkBlob = useFilesStore((s) => s.getAudioBlob)
  const updateFolder = useFilesStore((s) => s.updateFolder)
  const updateFileTrack = useFilesStore((s) => s.updateFileTrack)
  const deleteFileTrack = useFilesStore((s) => s.deleteFileTrack)
  const deleteFileSubtitle = useFilesStore((s) => s.deleteFileSubtitle)

  const { density, handleDensityChange } = useViewDensity('files.viewDensity')

  const { handleDroppedFiles, handleAudioInputChange, handleSubtitleInputChange } =
    useFileProcessing({
      currentFolderId,
      onComplete: loadData,
    })

  const {
    sensors,
    activeDragItem,
    isDragging,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    handleMoveTo,
  } = useFileDragDrop({ onComplete: loadData })
  const dragPreviewWidthClass = getDragPreviewWidthClass(density)

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
    onComplete: loadData,
    folders: folders || [],
  })

  const audioInputRef = useRef<HTMLInputElement>(null)
  const subtitleInputRef = useRef<HTMLInputElement>(null)
  const [targetTrackId, setTargetTrackId] = useState<string | null>(null)

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

  const existingTrackNames = tracks?.map((track) => track.name) || []
  const isInitialLoading = status === 'loading' && !folders?.length && !tracks?.length

  const [artworkBlobs, setArtworkBlobs] = useState<Record<string, Blob>>({})

  useEffect(() => {
    if (!tracks || tracks.length === 0) return

    let cancelled = false
    const blobs: Record<string, Blob> = {}

    const fetchArtworks = async () => {
      for (const track of tracks) {
        if (!track.artworkId) continue
        if (artworkBlobs[track.id]) continue

        try {
          const blob = await getArtworkBlob(track.artworkId)
          if (cancelled) return
          if (blob) {
            blobs[track.id] = blob
          }
        } catch (err) {
          logWarn('[Files] Failed to fetch artwork blob', err)
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
            title={t('filesTitle')}
            subtitle={t('filesSubtitle')}
            actions={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCreateFolder}
                  className="gap-2"
                >
                  <Plus size={18} />
                  <span>{t('filesNewFolder')}</span>
                </Button>
                <Button
                  type="button"
                  data-testid="add-audio-btn"
                  onClick={() => audioInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload size={18} />
                  <span>{t('filesAddAudio')}</span>
                </Button>
              </>
            }
          />

          <ViewControlsBar density={density} onDensityChange={handleDensityChange} />

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

          <div className="space-y-8 pb-20">
            {isInitialLoading && <FilesLoadingSkeletons isRoot />}

            {!isInitialLoading && (folders?.length || isNamingFolder) && (
              <FoldersGridSection
                folders={folders}
                folderCounts={folderCounts}
                density={density}
                isNamingFolder={isNamingFolder}
                newFolderName={newFolderName}
                setNewFolderName={setNewFolderName}
                namingInputRef={namingInputRef}
                namingContainerRef={namingContainerRef}
                onConfirmNewFolder={handleConfirmNewFolder}
                onCancelNamingFolder={() => setIsNamingFolder(false)}
                onPinFolder={async (folderId) => {
                  await updateFolder(folderId, { pinnedAt: Date.now() })
                  await loadData()
                }}
                onUnpinFolder={async (folderId) => {
                  await updateFolder(folderId, { pinnedAt: undefined })
                  await loadData()
                }}
                onRenameFolder={async (folderId, newName) => {
                  await updateFolder(folderId, { name: newName })
                  await loadData()
                }}
                onDeleteFolder={executeDeleteFolder}
                isDragging={isDragging}
                hasActiveDragItem={Boolean(activeDragItem)}
              />
            )}

            {!isInitialLoading && (
              <TracksListSection
                tracks={tracks}
                subtitles={subtitles}
                folders={folders}
                density={density}
                currentFolderId={currentFolderId}
                isGlobalDragging={isDragging}
                existingTrackNames={existingTrackNames}
                artworkBlobs={artworkBlobs}
                onPlay={(track, subtitle) => handlePlay(track, subtitles, subtitle)}
                onSetActiveSubtitle={handleSetActiveSubtitle}
                onTranscribeTrack={handleTranscribeTrack}
                onRenameTrack={async (trackId, newName) => {
                  try {
                    await updateFileTrack(trackId, { name: newName })
                    await loadData()
                  } catch (err) {
                    logError('[Files] Failed to rename track', err)
                    toast.errorKey('toastRenameFailed')
                  }
                }}
                onDeleteTrack={async (trackId) => {
                  try {
                    await deleteFileTrack(trackId)
                    await loadData()
                    return true
                  } catch (err) {
                    logError('[Files] Failed to delete track', err)
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
                    logError('[Files] Failed to delete subtitle', err)
                    toast.errorKey('toastDeleteFailed')
                    return false
                  }
                }}
                onAddSub={(trackId) => {
                  setTargetTrackId(trackId)
                  subtitleInputRef.current?.click()
                }}
                onAddAudio={() => audioInputRef.current?.click()}
                onMoveTrack={(track, folderId) => {
                  void handleMoveTo(track, folderId)
                }}
                isNamingFolder={isNamingFolder}
              />
            )}
          </div>

          <DragOverlay dropAnimation={null} modifiers={[snapCenterCursor]}>
            <FileDragPreview
              activeDragItem={activeDragItem}
              density={density}
              widthClassName={dragPreviewWidthClass}
            />
          </DragOverlay>
        </PageShell>
      </FileDropZone>
    </DndContext>
  )
}

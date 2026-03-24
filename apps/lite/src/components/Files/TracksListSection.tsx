import { FolderOpen, Plus, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FileFolder, FileSubtitle, FileTrack } from '../../lib/db/types'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { TrackCard } from './TrackCard'
import type { ViewDensity } from './types'

interface TracksListSectionProps {
  tracks: FileTrack[]
  subtitles: FileSubtitle[]
  folders: FileFolder[]
  density: ViewDensity
  currentFolderId: string | null
  isGlobalDragging: boolean
  existingTrackNames: string[]
  artworkBlobs: Record<string, Blob>
  onPlay: (track: FileTrack, subtitle?: FileSubtitle) => void
  onSetActiveSubtitle: (trackId: string, subtitleId: string) => void
  onTranscribeTrack: (trackId: string) => Promise<void> | void
  onRenameTrack: (trackId: string, newName: string) => Promise<void>
  onDeleteTrack: (trackId: string) => Promise<boolean>
  onDeleteSub: (subtitleId: string) => Promise<boolean> | boolean
  onAddSub: (trackId: string) => void
  onMoveTrack: (track: FileTrack, folderId: string | null) => void
  onAddAudio: () => void
  isNamingFolder?: boolean
}

export function TracksListSection({
  tracks,
  subtitles,
  folders,
  density,
  currentFolderId,
  isGlobalDragging,
  existingTrackNames,
  artworkBlobs,
  onPlay,
  onSetActiveSubtitle,
  onTranscribeTrack,
  onRenameTrack,
  onDeleteTrack,
  onDeleteSub,
  onAddSub,
  onMoveTrack,
  onAddAudio,
  isNamingFolder,
}: TracksListSectionProps) {
  const { t } = useTranslation()

  const hasTracks = tracks.length > 0
  const showFilesHeading = hasTracks && currentFolderId === null && folders.length > 0
  const showEmptyState =
    !hasTracks && (folders.length === 0 || currentFolderId !== null) && !isNamingFolder

  return (
    <div>
      {showFilesHeading && (
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">
          {t('filesFiles')}
        </h2>
      )}

      {hasTracks ? (
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
                isGlobalDragging={isGlobalDragging}
                existingTrackNames={existingTrackNames}
                artworkBlob={artworkBlobs[track.id]}
                onPlay={onPlay}
                onSetActiveSubtitle={onSetActiveSubtitle}
                onTranscribe={() => onTranscribeTrack(track.id)}
                onRename={(newName) => onRenameTrack(track.id, newName)}
                onDeleteTrack={() => onDeleteTrack(track.id)}
                onDeleteSub={onDeleteSub}
                onAddSub={() => onAddSub(track.id)}
                onMove={(folderId) => onMoveTrack(track, folderId)}
              />
            )
          })}
        </div>
      ) : (
        showEmptyState && (
          <EmptyState
            icon={currentFolderId === null ? Plus : FolderOpen}
            title={currentFolderId !== null ? t('folderEmptyTitle') : t('filesEmptyTitle')}
            description={currentFolderId !== null ? t('folderEmptyDesc') : t('filesEmptyDesc')}
            action={
              <Button type="button" onClick={onAddAudio}>
                <Upload className="w-4 h-4 me-2" />
                {t('filesAddAudio')}
              </Button>
            }
            className={cn(
              currentFolderId === null &&
                'py-32 border-2 border-dashed border-border/50 rounded-3xl bg-muted/20'
            )}
          />
        )
      )}
    </div>
  )
}

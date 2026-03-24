// src/components/Files/TrackCard.tsx

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cva } from 'class-variance-authority'
import { Clock, FileAudio, Package, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { useInlineRename } from '../../hooks/useInlineRename'
import { formatDuration } from '../../lib/dateUtils'
import type { FileFolder, FileSubtitle, FileTrack } from '../../lib/db/types'
import { formatFileSize } from '../../lib/formatters'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { RenameInput } from './RenameInput'
import styles from './TrackCard.module.css'
import { TrackCardSubtitles } from './TrackCardSubtitles'
import { TrackOverflowMenu } from './TrackOverflowMenu'
import type { ViewDensity } from './types'

// ============================================================================
// Variant definitions (cva)
// ============================================================================

const trackCardContentVariants = cva('flex items-center bg-card transition-colors', {
  variants: {
    density: {
      comfortable: 'px-4 py-3 gap-4',
      compact: 'px-3 py-2 gap-3',
    },
  },
  defaultVariants: {
    density: 'comfortable',
  },
})

const trackCardIconVariants = cva(
  'flex items-center justify-center flex-none text-muted-foreground cursor-grab active:cursor-grabbing',
  {
    variants: {
      density: {
        comfortable: 'w-16 h-16',
        compact: 'w-12 h-12',
      },
      hasArtwork: {
        true: 'shadow-none bg-transparent rounded-lg overflow-hidden',
        false: 'bg-muted shadow-inner rounded-lg overflow-hidden',
      },
    },
    defaultVariants: {
      density: 'comfortable',
      hasArtwork: false,
    },
  }
)

// ============================================================================
// Component
// ============================================================================

interface TrackCardProps {
  track: FileTrack
  subtitles: FileSubtitle[]
  folders: FileFolder[]
  density?: ViewDensity
  isGlobalDragging?: boolean
  existingTrackNames?: string[]
  artworkBlob?: Blob // Optional blob for embedded artwork
  onPlay: (track: FileTrack, subtitle?: FileSubtitle) => void
  onSetActiveSubtitle: (trackId: string, subtitleId: string) => void
  onTranscribe?: () => void
  onRename: (newName: string) => void
  onDeleteTrack: () => Promise<boolean>
  onDeleteSub: (subtitleId: string) => Promise<boolean> | boolean
  onAddSub: () => void
  onMove: (folderId: string | null) => void
}

export function TrackCard({
  track,
  subtitles,
  folders,
  density = 'comfortable',
  isGlobalDragging = false,
  existingTrackNames = [],
  artworkBlob,
  onPlay,
  onSetActiveSubtitle,
  onTranscribe,
  onRename,
  onDeleteTrack,
  onDeleteSub,
  onAddSub,
  onMove,
}: TrackCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `track-${track.id}`,
    data: { type: 'track', track },
  })

  const {
    isRenaming,
    value: renameValue,
    errorKind,
    inputRef,
    startRename,
    confirmRename,
    cancelRename,
    setValue: setRenameValue,
    handleKeyDown,
  } = useInlineRename({
    originalName: track.name,
    existingNames: existingTrackNames,
    entityKind: 'track',
    onCommit: onRename,
  })

  const handleCardMouseDown = (e: React.MouseEvent) => {
    if (isDragging) return

    if (isRenaming) {
      // If clicking on the card but NOT on the input or its control buttons, confirm rename.
      // We use onMouseDown + e.preventDefault() to catch the click before onBlur fires.
      const target = e.target as HTMLElement
      const isInput = target.closest('input')
      const isButton = target.closest('button')

      if (!isInput && !isButton) {
        e.preventDefault() // Keep focus in input (prevents blur timing issues)
        confirmRename()
      }
    }
  }

  const style = {
    // IMPORTANT: Disable transform when dragging so the original card stays in its list position.
    // This prevents the "double card" look since we have a separate DragOverlay.
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
    zIndex: isDragging ? 'var(--z-overlay)' : undefined,
    opacity: isDragging ? 0.3 : 1,
  }

  const isCompact = density === 'compact'
  const disableInteractions = isGlobalDragging && !isDragging
  const sizeLabel = formatFileSize(track.sizeBytes ?? 0, language)
  const durationLabel = track.durationSeconds ? formatDuration(track.durationSeconds, t) : ''

  const blobUrl = useImageObjectUrl(artworkBlob || null)
  const dragListeners = isRenaming ? undefined : listeners
  const dragAttributes = isRenaming ? undefined : attributes

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseDown={handleCardMouseDown}
      className={cn(
        'track-card border rounded-xl bg-card shadow-sm overflow-hidden transition-shadow relative select-none cursor-default',
        isDragging
          ? 'shadow-xl ring-2 ring-primary cursor-grabbing'
          : 'border-border hover:shadow-md',
        disableInteractions && 'pointer-events-none'
      )}
    >
      {/* Main Track Info */}
      <div className={trackCardContentVariants({ density })} {...dragListeners} {...dragAttributes}>
        <div
          className={cn(
            trackCardIconVariants({ density, hasArtwork: !!blobUrl }),
            'relative aspect-square',
            styles.artworkMask
          )}
        >
          {blobUrl ? (
            <img
              src={blobUrl}
              alt=""
              className="absolute inset-0 w-full h-full max-w-none object-cover block"
            />
          ) : (
            <FileAudio size={isCompact ? 20 : 24} strokeWidth={1.5} />
          )}
        </div>

        <div className="flex-1 min-w-0 pe-12">
          {isRenaming ? (
            <RenameInput
              value={renameValue}
              setValue={setRenameValue}
              errorKind={errorKind}
              conflictMessage={t('trackNameConflict')}
              inputRef={inputRef}
              onConfirm={() => confirmRename()}
              onCancel={cancelRename}
              onBlurConfirm={() => confirmRename(true)}
              onKeyDown={handleKeyDown}
              inputClassName="h-8 text-sm font-bold"
              confirmButtonClassName="h-8 w-8"
              cancelButtonClassName="h-8 w-8"
            />
          ) : (
            <>
              <h3
                className={cn(
                  'font-bold text-foreground truncate',
                  isCompact ? 'text-sm' : 'text-base'
                )}
                title={track.name}
              >
                {track.name}
              </h3>
              {(track.artist || track.album) && (
                <div className="-mt-0.5 truncate">
                  <span className="text-xs text-muted-foreground leading-tight block truncate">
                    {track.artist}
                    {track.artist && track.album && ' • '}
                    {track.album}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-6 relative" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center text-muted-foreground">
            <div className="flex items-center gap-2 text-xs font-medium tabular-nums whitespace-nowrap w-20">
              <Package size={16} className="shrink-0" />
              <span className="truncate">{sizeLabel}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs font-medium tabular-nums whitespace-nowrap w-24">
              <Clock size={16} className="shrink-0" />
              <span className="truncate">{durationLabel}</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0 w-32">
            <Button
              data-testid="play-track-btn"
              onClick={() => onPlay(track)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              size="sm"
              className="gap-2 h-8 px-3"
              disabled={disableInteractions}
            >
              <Play size={14} fill="currentColor" />
              <span>{t('btnPlayOnly')}</span>
            </Button>

            <TrackOverflowMenu
              folders={folders}
              currentFolderId={track.folderId}
              onMove={onMove}
              onTranscribe={onTranscribe}
              isRetranscribe={subtitles.length > 0}
              onRename={startRename}
              onDeleteTrack={onDeleteTrack}
              disabled={disableInteractions || isRenaming}
            />
          </div>
        </div>
      </div>

      <TrackCardSubtitles
        track={track}
        subtitles={subtitles}
        density={density}
        onPlay={onPlay}
        onSetActiveSubtitle={onSetActiveSubtitle}
        onDeleteSub={onDeleteSub}
        onAddSub={onAddSub}
      />
    </div>
  )
}

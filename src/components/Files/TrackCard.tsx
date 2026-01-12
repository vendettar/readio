// src/components/Files/TrackCard.tsx

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cva } from 'class-variance-authority'
import {
  Check,
  Clock,
  FileAudio,
  FileType,
  Lock,
  Package,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatDuration } from '../../libs/dateUtils'
import type { FileFolder, FileSubtitle, FileTrack } from '../../libs/dexieDb'
import { formatFileSize } from '../../libs/formatters'
import { formatRelativeTime } from '../../libs/relativeTime'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { TrackOverflowMenu } from './TrackOverflowMenu'
import type { ViewDensity } from './types'

// ============================================================================
// Variant definitions (cva)
// ============================================================================

const trackCardContentVariants = cva('flex items-center bg-card', {
  variants: {
    density: {
      comfortable: 'px-5 py-4 gap-6',
      compact: 'p-3 gap-4',
    },
  },
  defaultVariants: {
    density: 'comfortable',
  },
})

const trackCardIconVariants = cva(
  'bg-muted rounded-xl flex items-center justify-center flex-shrink-0 text-muted-foreground shadow-inner cursor-grab active:cursor-grabbing',
  {
    variants: {
      density: {
        comfortable: 'w-12 h-12',
        compact: 'w-10 h-10',
      },
    },
    defaultVariants: {
      density: 'comfortable',
    },
  }
)

const subtitleSectionVariants = cva('bg-muted/50 border-t border-border', {
  variants: {
    density: {
      comfortable: 'px-5 py-2',
      compact: 'px-3 py-1',
    },
  },
  defaultVariants: {
    density: 'comfortable',
  },
})

const subtitleRowVariants = cva(
  'group flex items-center rounded-md -mx-2 px-2 cursor-pointer transition-colors hover:bg-muted/50',
  {
    variants: {
      density: {
        comfortable: 'py-2.5 gap-6',
        compact: 'py-2 gap-4',
      },
    },
    defaultVariants: {
      density: 'comfortable',
    },
  }
)

const subtitleIconContainerVariants = cva('flex items-center justify-center flex-shrink-0', {
  variants: {
    density: {
      comfortable: 'w-12',
      compact: 'w-10',
    },
  },
  defaultVariants: {
    density: 'comfortable',
  },
})

// ============================================================================
// Component
// ============================================================================

interface TrackCardProps {
  track: FileTrack
  subtitles: FileSubtitle[]
  folders: FileFolder[]
  density?: ViewDensity
  lastPlayedAt?: number
  isGlobalDragging?: boolean
  existingTrackNames?: string[]
  onPlay: (track: FileTrack, subtitle?: FileSubtitle) => void
  onSetActiveSubtitle: (trackId: number, subtitleId: number) => void
  onRename: (newName: string) => void
  onDeleteTrack: () => Promise<boolean>
  onDeleteSub: (subtitleId: number) => void
  onAddSub: () => void
  onMove: (folderId: number | null) => void
}

export function TrackCard({
  track,
  subtitles,
  folders,
  density = 'comfortable',
  lastPlayedAt,
  isGlobalDragging = false,
  existingTrackNames = [],
  onPlay,
  onSetActiveSubtitle,
  onRename,
  onDeleteTrack,
  onDeleteSub,
  onAddSub,
  onMove,
}: TrackCardProps) {
  const { t, language } = useI18n()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `track-${track.id}`,
    data: { type: 'track', track },
  })

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(track.name)
  const [renameError, setRenameError] = useState(false)
  const [conflictError, setConflictError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleStartRename = () => {
    setRenameValue(track.name)
    setRenameError(false)
    setConflictError(false)
    setIsRenaming(true)
  }

  const handleConfirmRename = (isBlur = false) => {
    const trimmed = renameValue.trim()

    // 1. Handle empty input
    if (!trimmed) {
      if (isBlur) {
        handleCancelRename()
      } else {
        setRenameError(true)
        inputRef.current?.focus()
      }
      return
    }

    // 2. Handle same as original
    if (trimmed === track.name) {
      setIsRenaming(false)
      setRenameError(false)
      return
    }

    // 3. Handle conflict with other tracks (case-insensitive)
    const isConflict = existingTrackNames.some(
      (name) =>
        name.trim().toLowerCase() === trimmed.toLowerCase() &&
        name.trim().toLowerCase() !== track.name.trim().toLowerCase()
    )

    if (isConflict) {
      setConflictError(true)
      setRenameError(true)
      inputRef.current?.focus()
      return
    }

    // 4. Proceed with rename
    onRename(trimmed)
    setIsRenaming(false)
    setRenameError(false)
    setConflictError(false)
  }

  const handleCancelRename = () => {
    setIsRenaming(false)
    setRenameValue(track.name)
    setRenameError(false)
    setConflictError(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirmRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelRename()
    }
  }

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
        handleConfirmRename()
      }
    }
  }

  const style = {
    // IMPORTANT: Disable transform when dragging so the original card stays in its list position.
    // This prevents the "double card" look since we have a separate DragOverlay.
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.3 : 1,
  }

  const isCompact = density === 'compact'
  const disableInteractions = isGlobalDragging && !isDragging
  const sizeLabel = formatFileSize(track.sizeBytes ?? 0, language)
  const durationLabel = track.durationSeconds ? formatDuration(track.durationSeconds, t) : ''

  const MAX_SUBTITLES = 5
  const isSubtitleLimit = subtitles.length >= MAX_SUBTITLES

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
      <div className={trackCardContentVariants({ density })} {...listeners} {...attributes}>
        <div className={trackCardIconVariants({ density })}>
          <FileAudio size={isCompact ? 20 : 24} strokeWidth={1.5} />
        </div>

        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Popover open={conflictError}>
                  <PopoverAnchor asChild>
                    <Input
                      ref={inputRef}
                      type="text"
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      value={renameValue}
                      onChange={(e) => {
                        setRenameValue(e.target.value)
                        setRenameError(false)
                        setConflictError(false)
                      }}
                      onKeyDown={handleKeyDown}
                      onBlur={() => handleConfirmRename(true)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'h-8 text-base font-bold',
                        renameError && 'border-destructive focus-visible:ring-destructive'
                      )}
                    />
                  </PopoverAnchor>
                  <PopoverContent
                    side="top"
                    sideOffset={6}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="p-0 border-none bg-transparent shadow-none w-auto"
                  >
                    <div className="relative bg-destructive text-destructive-foreground text-xs px-2 py-1.5 rounded-md shadow-lg whitespace-nowrap flex items-center gap-1.5 font-bold">
                      <X size={10} strokeWidth={3} />
                      <span>{t('trackNameConflict')}</span>
                      {/* Arrow */}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-destructive rotate-45" />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                size="icon"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  handleConfirmRename()
                }}
                className="h-8 w-8"
              >
                <Check size={14} />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancelRename()
                }}
                className="h-8 w-8"
              >
                <X size={14} />
              </Button>
            </div>
          ) : (
            <>
              <h3
                className={cn(
                  'font-bold text-foreground truncate',
                  isCompact ? 'text-base' : 'text-lg'
                )}
                title={track.name}
              >
                {track.name}
              </h3>
              {lastPlayedAt && (
                <div className="-mt-1">
                  <span className="text-xs text-muted-foreground leading-tight">
                    {t('filesLastPlayed')} · {formatRelativeTime(lastPlayedAt)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 relative" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-4 text-muted-foreground mr-12 sm:mr-16 md:mr-24">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium tabular-nums whitespace-nowrap">
              <Package size={16} />
              <span>{sizeLabel}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-sm font-medium tabular-nums whitespace-nowrap">
              <Clock size={16} />
              <span>{durationLabel}</span>
            </div>
          </div>
          <Button
            onClick={() => onPlay(track)}
            size={isCompact ? 'sm' : 'default'}
            className="gap-2"
            disabled={disableInteractions}
          >
            <Play size={16} fill="currentColor" />
            <span>{t('btnPlayOnly')}</span>
          </Button>

          <TrackOverflowMenu
            folders={folders}
            currentFolderId={track.folderId}
            onMove={onMove}
            onRename={handleStartRename}
            onDeleteTrack={onDeleteTrack}
            disabled={disableInteractions || isRenaming}
          />
        </div>
      </div>

      {/* subtitle Section */}
      <div
        className={subtitleSectionVariants({ density })}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {subtitles.length > 0 && (
          <div className="divide-y divide-border/50 mb-2">
            {subtitles.map((sub) => (
              <div key={sub.id} className={subtitleRowVariants({ density })}>
                <div className={subtitleIconContainerVariants({ density })}>
                  <FileType size={16} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground block truncate">
                      {sub.name}
                    </span>
                    {sub.id === track.activeSubtitleId && subtitles.length > 1 && (
                      <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded">
                        <Check size={8} />
                        {t('filesActiveSubtitle')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (track.id && sub.id) {
                            onSetActiveSubtitle(track.id, sub.id)
                          }
                          onPlay(track, sub)
                        }}
                        className="h-7 w-7 text-primary hover:bg-primary/20 opacity-0 group-hover:opacity-100"
                        aria-label={t('filesPlayWithThis')}
                      >
                        <Play size={14} fill="currentColor" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={5}>{t('filesPlayWithThis')}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => sub.id && onDeleteSub(sub.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                        aria-label={t('commonDelete')}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={5}>{t('commonDelete')}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          onClick={onAddSub}
          disabled={isSubtitleLimit}
          className={cn(
            'w-full justify-start text-xs font-medium text-muted-foreground h-auto',
            !isSubtitleLimit && 'hover:text-foreground opacity-60 hover:opacity-100',
            isSubtitleLimit && 'opacity-40 cursor-not-allowed',
            subtitleRowVariants({ density })
          )}
        >
          <div className={subtitleIconContainerVariants({ density })}>
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                isSubtitleLimit
                  ? 'bg-muted text-muted-foreground/50'
                  : 'bg-muted text-muted-foreground group-hover/add:bg-muted-foreground/20 group-hover/add:text-foreground'
              )}
            >
              {isSubtitleLimit ? <Lock size={12} /> : <Plus size={14} />}
            </div>
          </div>
          <span>{isSubtitleLimit ? t('subtitleLimitHint') : t('subtitleAdd')}</span>
        </Button>
      </div>
    </div>
  )
}

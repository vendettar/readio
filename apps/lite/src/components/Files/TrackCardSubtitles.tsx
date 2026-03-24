import { cva } from 'class-variance-authority'
import { Check, FileType, Lock, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInlineDangerConfirm } from '../../hooks/useInlineDangerConfirm'
import type { FileSubtitle, FileTrack } from '../../lib/db/types'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { InlineConfirmSlot } from '../ui/inline-confirm-slot'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { ViewDensity } from './types'

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
  'group flex items-center rounded-md cursor-pointer transition-colors hover:bg-muted/50',
  {
    variants: {
      density: {
        comfortable: 'py-1.5 gap-6',
        compact: 'py-1 gap-4',
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

interface TrackCardSubtitlesProps {
  track: FileTrack
  subtitles: FileSubtitle[]
  density: ViewDensity
  onPlay: (track: FileTrack, subtitle?: FileSubtitle) => void
  onSetActiveSubtitle: (trackId: string, subtitleId: string) => void
  onDeleteSub: (subtitleId: string) => Promise<boolean> | boolean
  onAddSub: () => void
}

export function TrackCardSubtitles({
  track,
  subtitles,
  density,
  onPlay,
  onSetActiveSubtitle,
  onDeleteSub,
  onAddSub,
}: TrackCardSubtitlesProps) {
  const { t } = useTranslation()
  const MAX_SUBTITLES = 5
  const isSubtitleLimit = subtitles.length >= MAX_SUBTITLES
  const subtitleDeleteConfirm = useInlineDangerConfirm<HTMLDivElement>()
  const [deletingSubtitleId, setDeletingSubtitleId] = useState<string | null>(null)

  return (
    <div
      ref={subtitleDeleteConfirm.containerRef}
      className={subtitleSectionVariants({ density })}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="track-subtitles-section"
    >
      {subtitles.length > 0 && (
        <div className="mb-2">
          {subtitles.map((sub, index) => (
            <div
              key={sub.id}
              className={cn(subtitleRowVariants({ density }), 'relative smart-divider-group')}
            >
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
                <InlineConfirmSlot
                  active={subtitleDeleteConfirm.isActive(sub.id)}
                  slotClassName="min-w-[128px]"
                  idleContent={
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              onSetActiveSubtitle(track.id, sub.id)
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
                            type="button"
                            onClick={() => subtitleDeleteConfirm.openConfirm(sub.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                            aria-label={t('commonDelete')}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={5}>{t('commonDelete')}</TooltipContent>
                      </Tooltip>
                    </>
                  }
                  confirmContent={
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={deletingSubtitleId === sub.id}
                        onClick={subtitleDeleteConfirm.closeConfirm}
                      >
                        {t('commonCancel')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        data-testid={`subtitle-delete-confirm-${sub.id}`}
                        className="h-7 px-2 text-xs"
                        disabled={deletingSubtitleId === sub.id}
                        onClick={async () => {
                          if (deletingSubtitleId === sub.id) return
                          setDeletingSubtitleId(sub.id)
                          try {
                            const deleted = await onDeleteSub(sub.id)
                            if (deleted !== false) {
                              subtitleDeleteConfirm.closeConfirm()
                            }
                          } catch {
                            // Error feedback is handled by page-level caller.
                          } finally {
                            setDeletingSubtitleId((prev) => (prev === sub.id ? null : prev))
                          }
                        }}
                      >
                        {t('commonDelete')}
                      </Button>
                    </>
                  }
                />
              </div>
              {index < subtitles.length - 1 ? (
                <div
                  className={cn(
                    'pointer-events-none absolute bottom-0 start-0 end-0 h-px bg-border/50 transition-opacity duration-200',
                    'smart-divider smart-divider-bottom group-hover:opacity-0'
                  )}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAddSub}
        disabled={isSubtitleLimit}
        className={cn(
          'w-full text-start focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md text-xs font-medium text-muted-foreground',
          !isSubtitleLimit && 'hover:text-foreground opacity-60 hover:opacity-100 cursor-pointer',
          isSubtitleLimit && 'opacity-40 cursor-not-allowed',
          subtitleRowVariants({ density })
        )}
      >
        <div className={subtitleIconContainerVariants({ density })}>
          {isSubtitleLimit ? (
            <Lock size={16} className="text-muted-foreground/50" />
          ) : (
            <Plus size={16} className="text-muted-foreground transition-colors" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="block truncate text-start text-sm font-medium">
            {isSubtitleLimit ? t('subtitleLimitHint') : t('subtitleAdd')}
          </span>
        </div>
      </button>
    </div>
  )
}

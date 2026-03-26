import { cva } from 'class-variance-authority'
import {
  Check,
  ChevronLeft,
  Clock,
  Download,
  FileAudio,
  FilePlus,
  FileType,
  MoreHorizontal,
  Package,
  Play,
  RefreshCcw,
  Star,
  Trash2,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInlineDangerConfirm } from '../../hooks/useInlineDangerConfirm'
import { formatDateStandard, formatDuration } from '../../lib/dateUtils'
import type { FileSubtitle, PodcastDownload } from '../../lib/db/types'
import { formatFileSize } from '../../lib/formatters'
import { stripHtml } from '../../lib/htmlUtils'
import { logError } from '../../lib/logger'
import { cn } from '../../lib/utils'
import type { ViewDensity } from '../Files/types'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { InlineConfirmSlot } from '../ui/inline-confirm-slot'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

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
  'flex items-center justify-center flex-none text-muted-foreground',
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

const DOWNLOAD_ARTWORK_PLAY_ICON_SIZE = {
  compact: 16,
  comfortable: 20,
} as const

const DOWNLOAD_ARTWORK_PLAY_BUTTON_SCALE = {
  compact: 'xxl',
  comfortable: 'l',
} as const

const DOWNLOAD_FALLBACK_ARTWORK_ICON_SIZE = {
  compact: 20,
  comfortable: 24,
} as const

const DOWNLOAD_META_ICON_SIZE = 16
const DOWNLOAD_SUBTITLE_ACTION_ICON_SIZE = 14
type OverflowStep = 'menu' | 'confirm'

const DOWNLOAD_METADATA_SEPARATOR = ' • '

interface DownloadTrackCardProps {
  track: PodcastDownload
  artworkBlob: Blob | null
  subtitles: FileSubtitle[]
  density?: ViewDensity
  favorite?: {
    enabled: boolean
    favorited: boolean
    isSaving?: boolean
    onToggle: () => void
  }
  onPlay: (overrideSubtitleId?: string) => void
  onPlayWithoutTranscript?: () => void
  showPlayWithoutTranscriptAction?: boolean
  onRemove: () => Promise<boolean> | boolean
  onSetActiveSubtitle: (trackId: string, subtitleId: string) => void
  onDeleteSubtitle: (trackId: string, fileSubtitleId: string) => Promise<boolean> | boolean
  onExportSubtitle: (trackId: string, fileSubtitleId: string) => void
  onDownloadBundle?: () => void
  onImportSubtitle?: () => void
  onRetranscribe?: () => void
  episodeRoute?: {
    to: string
    params: Record<string, string>
  } | null
}

export function DownloadTrackCard({
  track,
  artworkBlob,
  subtitles,
  density = 'comfortable',
  favorite,
  onPlay,
  onPlayWithoutTranscript,
  showPlayWithoutTranscriptAction = false,
  onRemove,
  onSetActiveSubtitle,
  onDeleteSubtitle,
  onExportSubtitle,
  onDownloadBundle,
  onImportSubtitle,
  onRetranscribe,
  episodeRoute,
}: DownloadTrackCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [step, setStep] = useState<OverflowStep>('menu')
  const [isRemoving, setIsRemoving] = useState(false)
  const [deletingSubtitleId, setDeletingSubtitleId] = useState<string | null>(null)
  const deleteItemRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const prevStepRef = useRef<OverflowStep>('menu')
  const subtitleDeleteConfirm = useInlineDangerConfirm<HTMLDivElement>()

  const sizeLabel = formatFileSize(track.sizeBytes ?? 0, language)
  const durationLabel = track.durationSeconds ? formatDuration(track.durationSeconds, t) : ''

  const hasArtwork = artworkBlob != null || Boolean(track.sourceArtworkUrl?.trim())

  const title = track.sourceEpisodeTitle || track.name
  const subtitleRowTitle = title.trim()
  const formattedDate = track.downloadedAt ? formatDateStandard(track.downloadedAt, language) : ''
  const subtitle = [track.sourcePodcastTitle, formattedDate]
    .filter(Boolean)
    .join(DOWNLOAD_METADATA_SEPARATOR)
  const description = stripHtml(track.sourceDescription || '')

  const isCompact = density === 'compact'

  useLayoutEffect(() => {
    if (!isMenuOpen) {
      prevStepRef.current = 'menu'
      return
    }

    const prevStep = prevStepRef.current
    prevStepRef.current = step

    if (step === 'confirm' && prevStep !== 'confirm') {
      cancelButtonRef.current?.focus()
    } else if (step === 'menu' && prevStep === 'confirm') {
      deleteItemRef.current?.focus()
    }
  }, [isMenuOpen, step])

  const handleMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open)
    if (!open) {
      setIsRemoving(false)
      setStep('menu')
    }
  }

  return (
    <div className="track-card border rounded-xl bg-card shadow-sm overflow-hidden transition-shadow relative select-none cursor-default border-border hover:shadow-md group/episode">
      <div className={trackCardContentVariants({ density })}>
        <div
          className={cn(trackCardIconVariants({ density, hasArtwork }), 'relative aspect-square')}
        >
          {hasArtwork ? (
            <InteractiveArtwork
              src={track.sourceArtworkUrl}
              fallbackSrc={track.sourceArtworkUrl}
              blob={artworkBlob}
              onPlay={() => onPlay()}
              playLabel={t('btnPlayOnly')}
              hoverGroup="episode"
              playControlVisibility="hover-or-touch"
              playPosition="center"
              playIconSize={
                isCompact
                  ? DOWNLOAD_ARTWORK_PLAY_ICON_SIZE.compact
                  : DOWNLOAD_ARTWORK_PLAY_ICON_SIZE.comfortable
              }
              playButtonScale={
                isCompact
                  ? DOWNLOAD_ARTWORK_PLAY_BUTTON_SCALE.compact
                  : DOWNLOAD_ARTWORK_PLAY_BUTTON_SCALE.comfortable
              }
              size="original"
              className="w-full h-full rounded-lg"
            />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPlay()}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label={t('btnPlayOnly')}
              className="h-full w-full rounded-lg text-muted-foreground hover:bg-muted/60"
            >
              <FileAudio
                size={
                  isCompact
                    ? DOWNLOAD_FALLBACK_ARTWORK_ICON_SIZE.compact
                    : DOWNLOAD_FALLBACK_ARTWORK_ICON_SIZE.comfortable
                }
                strokeWidth={1.5}
              />
            </Button>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center w-full mb-0.5 relative">
            <InteractiveTitle
              title={title}
              to={episodeRoute?.to}
              params={episodeRoute?.params}
              className={cn(
                'font-bold text-foreground leading-tight',
                isCompact ? 'text-sm' : 'text-base'
              )}
              maxLines={1}
            />
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground/80 mb-0.5 line-clamp-1 font-normal tracking-tight">
              {subtitle}
            </div>
          )}
          {description && (
            <div
              className={cn(
                'text-xs text-muted-foreground/80 leading-snug font-light mb-1',
                isCompact ? 'line-clamp-1' : 'line-clamp-2'
              )}
            >
              {description}
            </div>
          )}
        </div>

        <div className="flex items-center gap-6 relative">
          <div className="flex items-center text-muted-foreground">
            <div className="flex items-center gap-2 text-xs font-medium tabular-nums whitespace-nowrap w-20">
              <Package size={DOWNLOAD_META_ICON_SIZE} className="shrink-0" />
              <span className="truncate">{sizeLabel}</span>
            </div>
            {durationLabel && (
              <div className="hidden md:flex items-center gap-2 text-xs font-medium tabular-nums whitespace-nowrap w-24">
                <Clock size={DOWNLOAD_META_ICON_SIZE} className="shrink-0" />
                <span className="truncate">{durationLabel}</span>
              </div>
            )}
          </div>
          <div className={cn('flex items-center justify-end gap-2 shrink-0 w-32')}>
            {favorite?.enabled && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-9 w-9 text-muted-foreground hover:bg-transparent hover:text-primary transition-opacity duration-200 shrink-0',
                  'opacity-0 group-hover/episode:opacity-100 focus-visible:opacity-100 group-focus-within/episode:opacity-100'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  favorite.onToggle()
                }}
                aria-label={favorite.favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
              >
                <Star
                  size={16}
                  className={cn(
                    'stroke-2',
                    favorite.favorited && 'fill-current text-primary',
                    favorite.isSaving && 'animate-pulse opacity-50'
                  )}
                />
              </Button>
            )}

            <DropdownMenu open={isMenuOpen} onOpenChange={handleMenuOpenChange} modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={t('ariaMoreActions')}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="end"
                sideOffset={8}
                collisionPadding={16}
                className="w-52 p-0 rounded-xl shadow-2xl overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="grid [grid-template-areas:'panel'] p-0 gap-0">
                  <div
                    className={cn(
                      '[grid-area:panel] overflow-hidden transition-all duration-150 ease-out',
                      step === 'menu'
                        ? 'opacity-100 translate-x-0'
                        : 'opacity-0 -translate-x-2 pointer-events-none h-0'
                    )}
                    inert={step !== 'menu' ? true : undefined}
                  >
                    {showPlayWithoutTranscriptAction && onPlayWithoutTranscript && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          onPlayWithoutTranscript()
                          setIsMenuOpen(false)
                        }}
                        className="cursor-pointer whitespace-nowrap justify-between"
                      >
                        <span>{t('playWithoutTranscript')}</span>
                        <Play size={14} />
                      </DropdownMenuItem>
                    )}
                    {onImportSubtitle && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          onImportSubtitle()
                          setIsMenuOpen(false)
                        }}
                        className="cursor-pointer whitespace-nowrap justify-between"
                      >
                        <span>{t('downloadsImportSubtitle')}</span>
                        <FilePlus size={14} />
                      </DropdownMenuItem>
                    )}
                    {onDownloadBundle && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          onDownloadBundle()
                          setIsMenuOpen(false)
                        }}
                        className="cursor-pointer whitespace-nowrap justify-between"
                      >
                        <span>{t('downloadEpisode')}</span>
                        <Download size={14} />
                      </DropdownMenuItem>
                    )}
                    {onRetranscribe && (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          onRetranscribe()
                          setIsMenuOpen(false)
                        }}
                        className="cursor-pointer whitespace-nowrap justify-between"
                      >
                        <span>
                          {subtitles.length > 0
                            ? t('asrRegenerateSubtitles')
                            : t('asrGenerateSubtitles')}
                        </span>
                        <RefreshCcw size={14} />
                      </DropdownMenuItem>
                    )}
                    {(showPlayWithoutTranscriptAction && onPlayWithoutTranscript) ||
                    onImportSubtitle ||
                    onDownloadBundle ||
                    onRetranscribe ? (
                      <DropdownMenuSeparator className="m-0" />
                    ) : null}
                    <DropdownMenuItem
                      ref={deleteItemRef}
                      onSelect={(e) => {
                        e.preventDefault()
                        setStep('confirm')
                      }}
                      className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer whitespace-nowrap justify-between"
                    >
                      <span>{t('commonDelete')}</span>
                      <Trash2 size={16} />
                    </DropdownMenuItem>
                  </div>

                  <div
                    className={cn(
                      '[grid-area:panel] overflow-hidden transition-all duration-150 ease-out',
                      step === 'confirm'
                        ? 'opacity-100 translate-x-0'
                        : 'opacity-0 translate-x-2 pointer-events-none h-0'
                    )}
                    inert={step !== 'confirm' ? true : undefined}
                  >
                    <div className="px-1.5 py-1.5 bg-muted/40 border-b border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start h-7 px-2 text-muted-foreground hover:text-foreground hover:bg-background"
                        onClick={(e) => {
                          e.stopPropagation()
                          setStep('menu')
                        }}
                      >
                        <ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" />
                        <span className="text-xs font-medium">{t('commonBack')}</span>
                      </Button>
                    </div>
                    <div className="p-4">
                      <div className="text-sm font-medium text-foreground">
                        {t('downloadsRemoveConfirmTitle')}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t('downloadsRemoveConfirmDesc')}
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          ref={cancelButtonRef}
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isRemoving}
                          onClick={(e) => {
                            e.stopPropagation()
                            setStep('menu')
                          }}
                        >
                          {t('commonCancel')}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isRemoving}
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (isRemoving) return
                            setIsRemoving(true)
                            try {
                              const ok = await onRemove()
                              if (ok) {
                                setIsMenuOpen(false)
                              }
                            } catch (error) {
                              logError('Error removing download', error)
                              // Error feedback is handled by page-level caller or logs.
                            } finally {
                              setIsRemoving(false)
                            }
                          }}
                        >
                          {t('commonDelete')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Subtitle versions list (like Files page) */}
      {subtitles.length > 0 && (
        <div
          ref={subtitleDeleteConfirm.containerRef}
          className={subtitleSectionVariants({ density })}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div>
            {subtitles.map((sub, index) => (
              <div
                key={sub.id}
                className={cn(subtitleRowVariants({ density }), 'relative smart-divider-group')}
              >
                <div className={subtitleIconContainerVariants({ density })}>
                  <FileType size={16} className="text-muted-foreground" />
                </div>
                <div className={cn('flex-1 min-w-0', isCompact && 'pe-3')}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-foreground block truncate">
                      {sub.sourceKind === 'manual_upload' ? sub.name : subtitleRowTitle || sub.name}
                    </span>
                    {sub.id === track.activeSubtitleId && subtitles.length > 1 && (
                      <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded">
                        <Check size={8} />
                        {t('filesActiveSubtitle')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 relative ms-12">
                  <div className="flex items-center text-muted-foreground me-0 sm:me-1 md:me-2 min-w-0 w-[4.5rem] sm:w-24 lg:w-56">
                    <div className="flex items-center gap-1 min-w-0">
                      {sub.provider?.trim() && (
                        <span className="inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-muted text-muted-foreground border border-border/60 truncate">
                          {sub.provider.trim()}
                        </span>
                      )}
                      {sub.model?.trim() && (
                        <span className="inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border/60 truncate">
                          {sub.model.trim()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={cn('flex items-center justify-end gap-2 shrink-0 w-32')}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            onSetActiveSubtitle(track.id, sub.id)
                          }}
                          className="h-7 w-7 text-primary hover:bg-primary/20 opacity-0 group-hover:opacity-100"
                          aria-label={t('filesPlayWithThis')}
                        >
                          <Play size={DOWNLOAD_SUBTITLE_ACTION_ICON_SIZE} fill="currentColor" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={5}>{t('filesPlayWithThis')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onExportSubtitle(track.id, sub.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/40 opacity-0 group-hover:opacity-100"
                          aria-label={t('subtitleVersionExport')}
                        >
                          <Download size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={5}>{t('subtitleVersionExport')}</TooltipContent>
                    </Tooltip>
                    <InlineConfirmSlot
                      active={subtitleDeleteConfirm.isActive(sub.id)}
                      slotClassName="w-7 overflow-visible"
                      confirmPanelClassName="inset-auto right-0 top-0 origin-right z-10"
                      idleContent={
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
                              <Trash2 size={DOWNLOAD_SUBTITLE_ACTION_ICON_SIZE} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={5}>{t('commonDelete')}</TooltipContent>
                        </Tooltip>
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
                                const deleted = await onDeleteSubtitle(track.id, sub.id)
                                if (deleted !== false) {
                                  subtitleDeleteConfirm.closeConfirm()
                                }
                              } catch (error) {
                                logError('Error deleting subtitle', error)
                                // Error feedback is handled by page-level caller or logs.
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
        </div>
      )}
    </div>
  )
}

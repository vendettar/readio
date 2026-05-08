import { Check, FileType, Play, SquareArrowRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInlineDangerConfirm } from '../../hooks/useInlineDangerConfirm'
import type { FileSubtitle, PodcastDownload } from '../../lib/db/types'
import { logError } from '../../lib/logger'
import { SUPPORTED_SUBTITLE_EXPORT_FORMATS, type SubtitleExportFormat } from '../../lib/subtitles'
import { cn } from '../../lib/utils'
import type { ViewDensity } from '../Files/types'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { InlineConfirmSlot } from '../ui/inline-confirm-slot'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

const subtitleSectionVariants = {
  comfortable: 'px-5 py-2',
  compact: 'px-3 py-1',
} as const

const subtitleRowVariants = {
  comfortable: 'py-1.5 gap-6',
  compact: 'py-1 gap-4',
} as const

const subtitleIconContainerVariants = {
  comfortable: 'w-12',
  compact: 'w-10',
} as const

const DOWNLOAD_SUBTITLE_ACTION_ICON_SIZE = 14

export function DownloadSubtitleList({
  track,
  subtitles,
  density,
  subtitleRowTitle,
  onSetActiveSubtitle,
  onDeleteSubtitle,
  onExportSubtitle,
}: {
  track: PodcastDownload
  subtitles: FileSubtitle[]
  density: ViewDensity
  subtitleRowTitle: string
  onSetActiveSubtitle: (trackId: string, subtitleId: string) => void
  onDeleteSubtitle: (trackId: string, fileSubtitleId: string) => Promise<boolean> | boolean
  onExportSubtitle: (trackId: string, fileSubtitleId: string, format: SubtitleExportFormat) => void
}) {
  const { t } = useTranslation()
  const [deletingSubtitleId, setDeletingSubtitleId] = useState<string | null>(null)
  const [openSubtitleExportMenuId, setOpenSubtitleExportMenuId] = useState<string | null>(null)
  const subtitleDeleteConfirm = useInlineDangerConfirm<HTMLDivElement>()
  const isCompact = density === 'compact'

  if (subtitles.length === 0) return null

  return (
    <div
      ref={subtitleDeleteConfirm.containerRef}
      className={cn('bg-muted/50 border-t border-border', subtitleSectionVariants[density])}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div>
        {subtitles.map((sub, index) => (
          <div
            key={sub.id}
            className={cn(
              'group flex items-center rounded-md cursor-pointer transition-colors hover:bg-muted/50 relative smart-divider-group',
              subtitleRowVariants[density]
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center flex-shrink-0',
                subtitleIconContainerVariants[density]
              )}
            >
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
                  {(sub.sourceKind === 'built_in' || sub.sourceKind === 'manual_upload') && (
                    <span className="inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-muted text-muted-foreground border border-border/60 truncate">
                      {sub.sourceKind === 'built_in'
                        ? t('subtitleVersionSourceBuiltIn')
                        : t('subtitleVersionSourceManual')}
                    </span>
                  )}
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
              <div className="flex items-center justify-end gap-2 shrink-0 w-32">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        onSetActiveSubtitle(track.id, sub.id)
                      }}
                      className={cn(
                        'h-7 w-7 text-primary hover:bg-primary/20 opacity-0 group-hover:opacity-100',
                        openSubtitleExportMenuId === sub.id && 'opacity-100'
                      )}
                      aria-label={t('filesPlayWithThis')}
                    >
                      <Play size={DOWNLOAD_SUBTITLE_ACTION_ICON_SIZE} fill="currentColor" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={5}>{t('filesPlayWithThis')}</TooltipContent>
                </Tooltip>
                <DropdownMenu
                  open={openSubtitleExportMenuId === sub.id}
                  onOpenChange={(open) => {
                    setOpenSubtitleExportMenuId(open ? sub.id : null)
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          className={cn(
                            'h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100',
                            openSubtitleExportMenuId === sub.id &&
                              'opacity-100 bg-muted text-foreground'
                          )}
                          aria-label={t('exportOptions')}
                        >
                          <SquareArrowRight size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={5}>{t('exportOptions')}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    collisionPadding={12}
                    className="w-24 rounded-xl overflow-hidden p-0"
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {SUPPORTED_SUBTITLE_EXPORT_FORMATS.map((format) => (
                      <DropdownMenuItem
                        key={format}
                        onSelect={() => {
                          onExportSubtitle(track.id, sub.id, format)
                          setOpenSubtitleExportMenuId(null)
                        }}
                        className="cursor-pointer justify-between whitespace-nowrap"
                      >
                        <span>{format}</span>
                        <FileType size={DOWNLOAD_SUBTITLE_ACTION_ICON_SIZE} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                          className={cn(
                            'h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100',
                            openSubtitleExportMenuId === sub.id && 'opacity-100'
                          )}
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
  )
}

import {
  ChevronLeft,
  FileAudio,
  FilePlus,
  MoreHorizontal,
  Play,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { logError } from '../../lib/logger'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { useNestedOverflowMenu } from '../ui/useNestedOverflowMenu'

type OverflowStep = 'menu' | 'confirm'

interface DownloadTrackOverflowMenuProps {
  hasAudioExportAction: boolean
  hasSubtitles: boolean
  onExportAudio?: () => void
  onImportSubtitle?: () => void
  onPlayWithoutTranscript?: () => void
  onRemove: () => Promise<boolean> | boolean
  onRetranscribe?: () => void
  showPlayWithoutTranscriptAction: boolean
}

export function DownloadTrackOverflowMenu({
  hasAudioExportAction,
  hasSubtitles,
  onExportAudio,
  onImportSubtitle,
  onPlayWithoutTranscript,
  onRemove,
  onRetranscribe,
  showPlayWithoutTranscriptAction,
}: DownloadTrackOverflowMenuProps) {
  const { t } = useTranslation()
  const [isRemoving, setIsRemoving] = useState(false)
  const deleteItemRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const prevStepRef = useRef<OverflowStep>('menu')
  const { closeMenu, handleOpenChange, isMenuOpen, menuContentRef, setStep, step, triggerRef } =
    useNestedOverflowMenu<OverflowStep>({
      initialStep: 'menu',
    })

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

  const handleMenuChange = (open: boolean) => {
    handleOpenChange(open)
    if (!open) {
      setIsRemoving(false)
    }
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={handleMenuChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
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
        <div ref={menuContentRef} className="grid [grid-template-areas:'panel'] p-0 gap-0">
          <div
            data-testid="downloads-overflow-menu-panel"
            className={[
              '[grid-area:panel] overflow-hidden transition-all duration-150 ease-out',
              step === 'menu'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-2 pointer-events-none h-0',
            ].join(' ')}
            inert={step !== 'menu' ? true : undefined}
          >
            {showPlayWithoutTranscriptAction && onPlayWithoutTranscript && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  onPlayWithoutTranscript()
                  closeMenu()
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
                  closeMenu()
                }}
                className="cursor-pointer whitespace-nowrap justify-between"
              >
                <span>{t('importTranscript')}</span>
                <FilePlus size={14} />
              </DropdownMenuItem>
            )}
            {hasAudioExportAction && (
              <DropdownMenuItem
                data-testid="downloads-export-audio"
                onSelect={(e) => {
                  e.preventDefault()
                  onExportAudio?.()
                  closeMenu()
                }}
                className="cursor-pointer whitespace-nowrap justify-between"
              >
                <span>{t('exportAudio')}</span>
                <FileAudio size={14} />
              </DropdownMenuItem>
            )}
            {onRetranscribe && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  onRetranscribe()
                  closeMenu()
                }}
                className="cursor-pointer whitespace-nowrap justify-between"
              >
                <span>{hasSubtitles ? t('asrRegenerateTranscript') : t('asrGenerateTranscript')}</span>
                <RefreshCcw size={14} />
              </DropdownMenuItem>
            )}
            {(showPlayWithoutTranscriptAction && onPlayWithoutTranscript) ||
            onImportSubtitle ||
            hasAudioExportAction ||
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
            data-testid="downloads-overflow-confirm-panel"
            className={[
              '[grid-area:panel] overflow-hidden transition-all duration-150 ease-out',
              step === 'confirm'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-2 pointer-events-none h-0',
            ].join(' ')}
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
                        closeMenu()
                      }
                    } catch (error) {
                      logError('Error removing download', error)
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
  )
}

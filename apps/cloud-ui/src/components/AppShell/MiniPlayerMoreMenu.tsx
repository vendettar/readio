import { FilePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  exportCurrentAudioForPlayback,
  exportCurrentTranscriptAndAudioBundle,
  exportCurrentTranscriptForPlayback,
  importTranscriptForCurrentPlayback,
  resolveCurrentPlaybackExportContext,
} from '../../lib/player/playbackExport'
import { cn } from '../../lib/utils'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu'
import { OverflowMenu } from '../ui/overflow-menu'

const TRANSCRIPT_IMPORT_ACCEPT = '.json,.srt,.vtt,application/json,text/plain,text/vtt'

export interface MiniPlayerMoreMenuAction {
  disabled: boolean
  onSelect: () => void | Promise<void>
}

export interface MiniPlayerMoreMenuImportAction {
  accept: string
  disabled: boolean
  onFileSelected: (file: File) => void | Promise<void>
}

export interface MiniPlayerMoreMenuController {
  triggerDisabled: boolean
  importTranscript: MiniPlayerMoreMenuImportAction
  exportTranscript: MiniPlayerMoreMenuAction
  exportAudio: MiniPlayerMoreMenuAction
  exportAll: MiniPlayerMoreMenuAction
}

type MiniPlayerMoreMenuStep = 'menu' | 'export'

type ExportAvailabilityState = {
  exportAudioDisabled: boolean
  exportAllDisabled: boolean
  exportTranscriptDisabled: boolean
}

const DEFAULT_EXPORT_AVAILABILITY: ExportAvailabilityState = {
  exportAudioDisabled: true,
  exportAllDisabled: true,
  exportTranscriptDisabled: true,
}

export function useMiniPlayerMoreMenuController(): MiniPlayerMoreMenuController {
  const audioTitle = usePlayerStore((s) => s.audioTitle)
  const audioUrl = usePlayerStore((s) => s.audioUrl)
  const episodeTranscriptUrl = usePlayerStore((s) => s.episodeMetadata?.transcriptUrl ?? null)
  const localTrackId = usePlayerStore((s) => s.localTrackId)
  const originalAudioUrl = usePlayerStore((s) => s.episodeMetadata?.originalAudioUrl ?? null)
  const loadRequestId = usePlayerStore((s) => s.loadRequestId)
  const subtitleCount = useTranscriptStore((s) => s.subtitles.length)
  const hasActiveTrack = Boolean(audioTitle || audioUrl)
  const [availability, setAvailability] = useState(DEFAULT_EXPORT_AVAILABILITY)
  const playbackContextKey = [
    localTrackId ?? '',
    originalAudioUrl ?? audioUrl ?? '',
    episodeTranscriptUrl ?? '',
    String(loadRequestId),
    String(subtitleCount),
  ].join('|')

  useEffect(() => {
    if (!hasActiveTrack) {
      setAvailability(DEFAULT_EXPORT_AVAILABILITY)
      return
    }

    let cancelled = false
    const requestKey = playbackContextKey

    void resolveCurrentPlaybackExportContext()
      .then((context) => {
        if (cancelled || requestKey !== playbackContextKey) return

        setAvailability({
          exportTranscriptDisabled: !context?.canExportTranscript,
          exportAudioDisabled: !context?.canExportAudio,
          exportAllDisabled: !context?.canExportBundle,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setAvailability(DEFAULT_EXPORT_AVAILABILITY)
        }
      })

    return () => {
      cancelled = true
    }
  }, [hasActiveTrack, playbackContextKey])

  return {
    triggerDisabled: !hasActiveTrack,
    importTranscript: {
      accept: TRANSCRIPT_IMPORT_ACCEPT,
      disabled: !hasActiveTrack,
      onFileSelected: (file) => void importTranscriptForCurrentPlayback(file),
    },
    exportTranscript: {
      disabled: !hasActiveTrack || availability.exportTranscriptDisabled,
      onSelect: () => void exportCurrentTranscriptForPlayback(),
    },
    exportAudio: {
      disabled: !hasActiveTrack || availability.exportAudioDisabled,
      onSelect: () => void exportCurrentAudioForPlayback(),
    },
    exportAll: {
      disabled: !hasActiveTrack || availability.exportAllDisabled,
      onSelect: () => void exportCurrentTranscriptAndAudioBundle(),
    },
  }
}

export function MiniPlayerMoreMenu({ controller }: { controller: MiniPlayerMoreMenuController }) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [step, setStep] = useState<MiniPlayerMoreMenuStep>('menu')

  const handleOpenChange = (open: boolean) => {
    setIsMenuOpen(open)
    if (!open) {
      setStep('menu')
    }
  }

  const runAction = (action: MiniPlayerMoreMenuAction) => {
    if (action.disabled) return
    setIsMenuOpen(false)
    setStep('menu')
    void action.onSelect()
  }

  const triggerImportPicker = () => {
    if (controller.importTranscript.disabled) return
    setIsMenuOpen(false)
    setStep('menu')
    window.setTimeout(() => {
      fileInputRef.current?.click()
    }, 0)
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={controller.importTranscript.accept}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file || controller.importTranscript.disabled) return
          void controller.importTranscript.onFileSelected(file)
        }}
      />

      <OverflowMenu
        open={isMenuOpen}
        onOpenChange={handleOpenChange}
        disabled={controller.triggerDisabled}
        triggerAriaLabel={t('miniPlayerMore')}
        iconOrientation="vertical"
        stopPropagation
        align="end"
        contentClassName="w-52 p-0 rounded-xl shadow-2xl overflow-hidden"
        triggerClassName="h-8 w-8 text-muted-foreground hover:text-foreground"
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
            <DropdownMenuItem
              data-testid="mini-player-import-transcript"
              disabled={controller.importTranscript.disabled}
              onSelect={(event) => {
                event.preventDefault()
                triggerImportPicker()
              }}
              className="cursor-pointer whitespace-nowrap justify-between"
            >
              <span>{t('importTranscript')}</span>
              <FilePlus size={14} />
            </DropdownMenuItem>

            <DropdownMenuSeparator className="m-0" />

            <DropdownMenuItem
              data-testid="mini-player-export-options"
              onSelect={(event) => {
                event.preventDefault()
                setStep('export')
              }}
              className="cursor-pointer whitespace-nowrap justify-between"
            >
              <span>{t('exportOptions')}</span>
              <span aria-hidden="true">›</span>
            </DropdownMenuItem>
          </div>

          <div
            className={cn(
              '[grid-area:panel] overflow-hidden transition-all duration-150 ease-out',
              step === 'export'
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-2 pointer-events-none h-0'
            )}
            inert={step !== 'export' ? true : undefined}
          >
            <DropdownMenuItem
              data-testid="mini-player-export-back"
              onSelect={(event) => {
                event.preventDefault()
                setStep('menu')
              }}
              className="cursor-pointer whitespace-nowrap"
            >
              <span aria-hidden="true">‹</span>
              <span>{t('exportOptions')}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="m-0" />

            <DropdownMenuItem
              data-testid="mini-player-export-transcript"
              disabled={controller.exportTranscript.disabled}
              onSelect={(event) => {
                event.preventDefault()
                runAction(controller.exportTranscript)
              }}
              className="cursor-pointer whitespace-nowrap"
            >
              <span>{t('exportTranscript')}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              data-testid="mini-player-export-audio"
              disabled={controller.exportAudio.disabled}
              onSelect={(event) => {
                event.preventDefault()
                runAction(controller.exportAudio)
              }}
              className="cursor-pointer whitespace-nowrap"
            >
              <span>{t('exportAudio')}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              data-testid="mini-player-export-all"
              disabled={controller.exportAll.disabled}
              onSelect={(event) => {
                event.preventDefault()
                runAction(controller.exportAll)
              }}
              className="cursor-pointer whitespace-nowrap"
            >
              <span>{t('exportAll')}</span>
            </DropdownMenuItem>
          </div>
        </div>
      </OverflowMenu>
    </>
  )
}

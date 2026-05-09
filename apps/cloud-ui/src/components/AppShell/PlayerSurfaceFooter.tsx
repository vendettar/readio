import { Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatTimeLabel } from '../../lib/subtitles'
import { cn } from '../../lib/utils'
import { usePlayerStore } from '../../store/playerStore'
import { PlaybackSpeedButton } from '../Player/controls/PlaybackSpeedButton'
import { TransportPlayPauseButton } from '../Player/controls/TransportPlayPauseButton'
import { TransportSkipButton } from '../Player/controls/TransportSkipButton'
import { PlayerDownloadAction } from '../Player/PlayerDownloadAction'
import { ShareButton } from '../Player/ShareButton'
import { SleepTimerButton } from '../Player/SleepTimerButton'
import { ReadingBgControl } from '../ReadingBgControl'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Slider } from '../ui/slider'
import styles from './FullPlayer.module.css'

interface PlayerSurfaceFooterProps {
  audioTitle: string
  audioLoaded: boolean
  isPlaying: boolean
  status: string
  playbackRate: number
  togglePlayPause: () => void
  handleSkipBack: () => void
  handleSkipForward: () => void
  handlePlaybackRateClick: () => void
  isPlayerSettingsOpen: boolean
  setIsPlayerSettingsOpen: (open: boolean) => void
  setIsSleepTimerOpen: (open: boolean) => void
  PLAYER_OWNED_OVERLAY_ATTR: string
}

const FullPlayerSeekBar = ({ ariaLabel }: { ariaLabel: string }) => {
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const seekTo = usePlayerStore((s) => s.seekTo)

  return (
    <div className="flex items-center gap-4 mb-6 group">
      <span className="text-xs text-muted-foreground tabular-nums w-12 text-start font-medium">
        {formatTimeLabel(progress)}
      </span>
      <div className="flex-1 relative h-5 flex items-center cursor-pointer">
        <Slider
          value={[progress]}
          min={0}
          max={duration || 100}
          step={0.1}
          onValueChange={(values) => seekTo(values[0])}
          aria-label={ariaLabel}
          className="w-full cursor-pointer"
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-12 font-medium">
        {formatTimeLabel(duration)}
      </span>
    </div>
  )
}

export function PlayerSurfaceFooter({
  audioTitle,
  audioLoaded,
  isPlaying,
  status,
  playbackRate,
  togglePlayPause,
  handleSkipBack,
  handleSkipForward,
  handlePlaybackRateClick,
  isPlayerSettingsOpen,
  setIsPlayerSettingsOpen,
  setIsSleepTimerOpen,
  PLAYER_OWNED_OVERLAY_ATTR,
}: PlayerSurfaceFooterProps) {
  const { t } = useTranslation()

  return (
    <div className="absolute bottom-0 start-0 end-0 bg-background/60 backdrop-blur-xl backdrop-saturate-150 border-t border-border/50 px-8 py-6 pointer-events-auto">
      <div className="max-w-4xl mx-auto">
        <FullPlayerSeekBar ariaLabel={t('ariaPlaybackProgress')} />
        <div className="flex items-center justify-between">
          <div className="w-1/3 flex items-center justify-start">
            <PlaybackSpeedButton
              playbackRate={playbackRate}
              onCycleRate={handlePlaybackRateClick}
              className="text-xs font-bold tracking-widest uppercase"
              ariaLabel={t('ariaPlaybackSpeed')}
            />
          </div>

          <div className="flex items-center gap-10">
            <TransportSkipButton
              direction="back"
              onClick={handleSkipBack}
              className="h-12 w-12"
              ariaLabel={t('skipBack10s')}
              title={t('skipBack10s')}
              iconSize={28}
              iconStrokeWidth={1}
            />
            <TransportPlayPauseButton
              isPlaying={isPlaying}
              isLoading={status === 'loading'}
              disabled={status === 'loading' || !audioLoaded}
              onToggle={togglePlayPause}
              className="w-16 h-16 rounded-full shadow-xl shadow-muted/50"
              ariaLabel={isPlaying ? t('ariaPause') : t('ariaPlay')}
              iconSize={28}
              playClassName="ms-1"
              loadingClassName={cn(styles.animationPaused)}
            />
            <TransportSkipButton
              direction="forward"
              onClick={handleSkipForward}
              className="h-12 w-12"
              ariaLabel={t('skipForward10s')}
              title={t('skipForward10s')}
              iconSize={28}
              iconStrokeWidth={1}
            />
          </div>

          <div className="w-1/3 flex items-center justify-end gap-2">
            <PlayerDownloadAction />
            <ShareButton title={audioTitle} url={window.location.href} />
            <SleepTimerButton onOpenChange={setIsSleepTimerOpen} />
            <Popover open={isPlayerSettingsOpen} onOpenChange={setIsPlayerSettingsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('ariaSettings')}>
                  <Settings2 size={20} strokeWidth={1.5} />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" {...{ [PLAYER_OWNED_OVERLAY_ATTR]: 'true' }}>
                <ReadingBgControl />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  )
}

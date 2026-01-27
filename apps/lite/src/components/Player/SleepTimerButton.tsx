import { Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSleepTimer } from '../../hooks/useSleepTimer'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export function SleepTimerButton() {
  const { t } = useTranslation()
  const { isActive, remainingSeconds, isEndOfEpisode, startTimer, startEndOfEpisode, cancelTimer } =
    useSleepTimer()

  const formatRemaining = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const tooltipText = isActive
    ? isEndOfEpisode
      ? t('timer.endOfEpisode')
      : t('timer.remaining', { time: formatRemaining(remainingSeconds || 0) })
    : t('sidebarSettings') // Generic fallback

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('rounded-full transition-all duration-300', isActive && 'text-primary')}
            >
              <Moon className={cn('size-5', isActive && 'fill-current')} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltipText}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="center" side="top" className="w-48">
        <DropdownMenuItem onClick={() => startTimer(15)}>{t('timer.15m')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => startTimer(30)}>{t('timer.30m')}</DropdownMenuItem>
        <DropdownMenuItem onClick={startEndOfEpisode}>{t('timer.endOfEpisode')}</DropdownMenuItem>

        {isActive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={cancelTimer}
              className="text-destructive focus:text-destructive"
            >
              {t('timer.cancel')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

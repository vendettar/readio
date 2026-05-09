import { ChevronDown, Minimize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'

interface PlayerSurfaceHeaderProps {
  isDocked: boolean
  hasActiveTrack: boolean
  audioTitle: string
  onMinimize: () => void
  onExit: () => void
}

export function PlayerSurfaceHeader({
  isDocked,
  hasActiveTrack,
  audioTitle,
  onMinimize,
  onExit,
}: PlayerSurfaceHeaderProps) {
  const { t } = useTranslation()

  if (isDocked) {
    return (
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/95 backdrop-blur-md z-10 flex-shrink-0">
        <h3 className="font-semibold text-lg truncate max-w-[80%]">
          {audioTitle || t('untitled')}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMinimize}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={t('ariaMinimize')}
          >
            <ChevronDown size={24} />
          </Button>
        </div>
      </div>
    )
  }

  if (hasActiveTrack) {
    return (
      <div className="absolute top-6 end-10 z-full-player pointer-events-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={onExit}
          className="bg-background/80 backdrop-blur-sm shadow-sm"
          aria-label={t('ariaMinimize')}
        >
          <Minimize2 size={20} />
        </Button>
      </div>
    )
  }

  return null
}

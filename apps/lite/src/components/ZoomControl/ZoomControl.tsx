// src/components/ZoomControl/ZoomControl.tsx
import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface ZoomControlProps {
  zoomScale: number
  isVisible: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function ZoomControl({
  zoomScale,
  isVisible,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onMouseEnter,
  onMouseLeave,
}: ZoomControlProps) {
  const { t } = useTranslation()

  if (!isVisible) return null

  return (
    <div
      className="fixed bottom-24 right-8 z-50 flex items-center gap-2 p-1 bg-popover/80 backdrop-blur-md border rounded-full shadow-lg animate-in fade-in slide-in-from-right-4"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="px-3 text-xs font-bold tabular-nums text-muted-foreground mr-1">
        {Math.round(zoomScale * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('ariaZoomOut')}
        onClick={onZoomOut}
        className="h-8 w-8 rounded-full"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('ariaZoomIn')}
        onClick={onZoomIn}
        className="h-8 w-8 rounded-full"
      >
        <Plus className="h-4 w-4" />
      </Button>
      <div className="w-px h-4 bg-border mx-1" />
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('ariaResetZoom')}
        onClick={onZoomReset}
        className="h-8 px-3 text-xs font-bold uppercase tracking-wider rounded-full"
      >
        {t('resetZoom')}
      </Button>
    </div>
  )
}

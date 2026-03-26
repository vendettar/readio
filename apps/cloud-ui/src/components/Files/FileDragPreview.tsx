import { FileAudio } from 'lucide-react'
import type { FileTrack } from '../../lib/db/types'
import { cn } from '../../lib/utils'
import type { ViewDensity } from './types'

interface FileDragPreviewProps {
  activeDragItem: FileTrack | null
  density: ViewDensity
  widthClassName: string
}

export function FileDragPreview({ activeDragItem, density, widthClassName }: FileDragPreviewProps) {
  if (!activeDragItem) return null

  return (
    <div
      className={cn(
        'bg-card border border-primary shadow-xl rounded-xl flex items-center opacity-90 pointer-events-none -translate-x-1/2 -translate-y-1/2',
        widthClassName,
        density === 'compact' ? 'p-2.5 gap-2.5' : 'p-3 gap-3'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 bg-muted flex items-center justify-center text-muted-foreground',
          density === 'compact' ? 'w-7 h-7 rounded-md' : 'w-8 h-8 rounded-lg'
        )}
      >
        <FileAudio size={density === 'compact' ? 14 : 16} />
      </div>
      <span
        className={cn(
          'min-w-0 flex-1 text-foreground font-semibold leading-tight whitespace-normal break-words overflow-hidden',
          density === 'compact' ? 'text-xs max-h-9' : 'text-sm max-h-10'
        )}
      >
        {activeDragItem.name}
      </span>
    </div>
  )
}

// src/components/Files/ViewControlsBar.tsx

import { LayoutList, List } from 'lucide-react'
import type * as React from 'react'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { ViewDensity } from './types'

interface ViewControlsBarProps {
  density: ViewDensity
  onDensityChange: (density: ViewDensity) => void
  /** Slot for future controls (Sort/Group/Filter) */
  leftSlot?: React.ReactNode
  disabled?: boolean
}

export function ViewControlsBar({
  density,
  onDensityChange,
  leftSlot,
  disabled = false,
}: ViewControlsBarProps) {
  const { t } = useI18n()

  return (
    <div className="flex items-center justify-between py-2 mb-4">
      {/* Left slot for future Sort/Group/Filter controls */}
      <div className="flex items-center gap-2">{leftSlot}</div>

      {/* Density toggle */}
      <div
        role="radiogroup"
        aria-label={t('ariaViewDensity')}
        className="flex items-center rounded-lg border border-border overflow-hidden"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={density === 'comfortable' ? 'secondary' : 'ghost'}
              size="icon"
              className={cn('rounded-none h-8 w-8', density === 'comfortable' && 'bg-secondary')}
              onClick={() => onDensityChange('comfortable')}
              disabled={disabled}
              aria-label={t('filesDensityComfortable')}
              aria-checked={density === 'comfortable'}
              role="radio"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={5}>{t('tooltipComfortableView')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={density === 'compact' ? 'secondary' : 'ghost'}
              size="icon"
              className={cn(
                'rounded-none border-l border-border h-8 w-8',
                density === 'compact' && 'bg-secondary'
              )}
              onClick={() => onDensityChange('compact')}
              disabled={disabled}
              aria-label={t('filesDensityCompact')}
              aria-checked={density === 'compact'}
              role="radio"
            >
              <List className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={5}>{t('tooltipCompactView')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

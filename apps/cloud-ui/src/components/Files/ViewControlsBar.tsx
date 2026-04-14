// src/components/Files/ViewControlsBar.tsx

import { LayoutList, List } from 'lucide-react'
import type * as React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
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
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between py-2 mb-4">
      {/* Left slot for future Sort/Group/Filter controls */}
      <div className="flex items-center gap-2">{leftSlot}</div>

      {/* Density toggle */}
      <RadioGroup
        value={density}
        onValueChange={(value) => onDensityChange(value as ViewDensity)}
        aria-label={t('ariaViewDensity')}
        className="flex items-center rounded-lg border border-border overflow-hidden gap-0"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <RadioGroupItem value="comfortable" asChild disabled={disabled}>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'rounded-none h-8 w-8 hover:bg-transparent',
                  density === 'comfortable' && 'bg-secondary text-foreground hover:bg-secondary'
                )}
                aria-label={t('filesDensityComfortable')}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
            </RadioGroupItem>
          </TooltipTrigger>
          <TooltipContent sideOffset={5}>{t('tooltipComfortableView')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <RadioGroupItem value="compact" asChild disabled={disabled}>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'rounded-none border-s border-border h-8 w-8 hover:bg-transparent',
                  density === 'compact' && 'bg-secondary text-foreground hover:bg-secondary'
                )}
                aria-label={t('filesDensityCompact')}
              >
                <List className="h-4 w-4" />
              </Button>
            </RadioGroupItem>
          </TooltipTrigger>
          <TooltipContent sideOffset={5}>{t('tooltipCompactView')}</TooltipContent>
        </Tooltip>
      </RadioGroup>
    </div>
  )
}

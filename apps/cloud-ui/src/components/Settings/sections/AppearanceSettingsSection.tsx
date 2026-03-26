import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '../../ui/button'
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface AccentOption {
  name: string
  swatchClassName: string
}

interface AppearanceSettingsSectionProps {
  accent: string
  accentOptions: readonly AccentOption[]
  onAccentChange: (value: string) => void
}

export const AppearanceSettingsSection = memo(function AppearanceSettingsSection({
  accent,
  accentOptions,
  onAccentChange,
}: AppearanceSettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard title={t('settingsAppearance')} description={t('settingsAppearanceDesc')}>
      <div className="space-y-3">
        <div
          id="accent-color-label"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {t('settingsAccentColor')}
        </div>
        <RadioGroup
          value={accent}
          onValueChange={onAccentChange}
          aria-labelledby="accent-color-label"
          className="flex flex-wrap gap-2"
        >
          {accentOptions.map((option) => (
            <RadioGroupItem key={option.name} value={option.name} asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'w-8 h-8 rounded-full p-0 hover:bg-transparent',
                  'data-[state=checked]:ring-2 data-[state=checked]:ring-offset-2 data-[state=checked]:ring-primary data-[state=checked]:scale-110',
                  'data-[state=unchecked]:opacity-70 data-[state=unchecked]:hover:opacity-100'
                )}
                title={option.name}
              >
                <div className={cn('w-full h-full rounded-full', option.swatchClassName)} />
              </Button>
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </div>
    </SettingsSectionCard>
  )
})

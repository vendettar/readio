import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '../../ui/checkbox'
import { Label } from '../../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface GeneralSettingsSectionProps {
  language: string
  languages: Record<string, string>
  country: string
  supportedRegions: readonly string[]
  onLanguageChange: (value: string) => void
  onCountryChange: (value: string) => void
}

export const GeneralSettingsSection = memo(function GeneralSettingsSection({
  language,
  languages,
  country,
  supportedRegions,
  onLanguageChange,
  onCountryChange,
}: GeneralSettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard title={t('settingsGeneral')} description={t('settingsGeneralDesc')}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label htmlFor="settings-language-select">{t('ariaLanguage')}</Label>
            <Select value={language} onValueChange={onLanguageChange}>
              <SelectTrigger id="settings-language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(languages).map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label htmlFor="settings-content-region-select">{t('settingsContentRegion')}</Label>
            <Select value={country} onValueChange={onCountryChange}>
              <SelectTrigger id="settings-content-region-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedRegions.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Checkbox id="auto-scroll" defaultChecked />
          <Label htmlFor="auto-scroll" className="cursor-pointer">
            {t('settingsAutoScroll')}
          </Label>
        </div>
      </div>
    </SettingsSectionCard>
  )
})

import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { SettingsSectionCard } from '../SettingsSectionCard'

export const LegalSettingsSection = memo(function LegalSettingsSection() {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard title={t('settingsLegal')}>
      <div className="space-y-2">
        <Button variant="ghost" className="w-full justify-between" asChild>
          <Link to="/legal/privacy">
            {t('settingsPrivacyPolicy')}
            <ExternalLink size={14} className="text-muted-foreground" />
          </Link>
        </Button>
        <Button variant="ghost" className="w-full justify-between" asChild>
          <Link to="/legal/terms">
            {t('settingsTermsOfService')}
            <ExternalLink size={14} className="text-muted-foreground" />
          </Link>
        </Button>
      </div>
    </SettingsSectionCard>
  )
})

import { Download, Info } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface DiagnosticsSettingsSectionProps {
  onDownloadLogs: () => void
}

export const DiagnosticsSettingsSection = memo(function DiagnosticsSettingsSection({
  onDownloadLogs,
}: DiagnosticsSettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard
      title={t('settings.diagnosticsTitle')}
      description={t('settings.diagnosticsDesc')}
      icon={<Info size={18} className="text-primary" />}
    >
      <Button
        variant="outline"
        onClick={onDownloadLogs}
        className="flex gap-2 w-full sm:w-auto"
        aria-label={t('settings.downloadLogs')}
      >
        <Download size={16} />
        {t('settings.downloadLogs')}
      </Button>
    </SettingsSectionCard>
  )
})

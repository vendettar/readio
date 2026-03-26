import { ShieldCheck } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTimestamp } from '@/lib/formatters'
import type { IntegrityCheckReport } from '@/lib/retention'
import { Button } from '../../ui/button'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface MaintenanceSettingsSectionProps {
  isRunning: boolean
  lastReport: IntegrityCheckReport | null
  onRunNow: () => Promise<void>
  language: string
}

export const MaintenanceSettingsSection = memo(function MaintenanceSettingsSection({
  isRunning,
  lastReport,
  onRunNow,
  language,
}: MaintenanceSettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard
      title={t('settings.maintenanceTitle')}
      description={t('settings.maintenanceDesc')}
      icon={<ShieldCheck size={18} className="text-primary" />}
      contentClassName="space-y-4"
    >
      <Button
        variant="outline"
        onClick={() => {
          void onRunNow()
        }}
        disabled={isRunning}
        className="w-full sm:w-auto"
      >
        {isRunning ? t('settings.maintenanceRunning') : t('settings.maintenanceRunNow')}
      </Button>

      {lastReport ? (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-sm">
          <p className="text-muted-foreground">
            {t('settings.maintenanceLastChecked')}:{' '}
            <span className="text-foreground">
              {formatTimestamp(lastReport.checkedAt, language)}
            </span>
          </p>
          <p>
            {t('settings.maintenanceRepairs')}:{' '}
            <span className="font-medium">{lastReport.totalRepairs}</span>
          </p>
        </div>
      ) : null}
    </SettingsSectionCard>
  )
})

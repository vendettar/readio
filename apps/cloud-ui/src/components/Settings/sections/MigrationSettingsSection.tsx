import { Download, Upload } from 'lucide-react'
import type { ChangeEvent, RefObject } from 'react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { HiddenFileInput } from '../../ui/hidden-file-input'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface MigrationSettingsSectionProps {
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onImport: () => void
  onExport: () => void
}

export const MigrationSettingsSection = memo(function MigrationSettingsSection({
  fileInputRef,
  onFileChange,
  onImport,
  onExport,
}: MigrationSettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard title={t('settingsMigration')} description={t('settingsMigrationDesc')}>
      <div className="space-y-4">
        <HiddenFileInput
          ref={fileInputRef}
          onChange={(event) => {
            void onFileChange(event)
          }}
          accept=".opml,.xml,text/xml"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button variant="outline" onClick={onImport} className="flex gap-2">
            <Upload size={16} />
            {t('settingsImportOpml')}
          </Button>
          <Button variant="outline" onClick={onExport} className="flex gap-2">
            <Download size={16} />
            {t('settingsExportOpml')}
          </Button>
        </div>
      </div>
    </SettingsSectionCard>
  )
})

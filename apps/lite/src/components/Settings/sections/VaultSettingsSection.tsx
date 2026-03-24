import { Download, Shield, Upload } from 'lucide-react'
import type { ChangeEvent, RefObject } from 'react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { HiddenFileInput } from '../../ui/hidden-file-input'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface VaultSettingsSectionProps {
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onImport: () => void
  onExport: () => void
}

export const VaultSettingsSection = memo(function VaultSettingsSection({
  fileInputRef,
  onFileChange,
  onImport,
  onExport,
}: VaultSettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard
      title={t('settingsVault')}
      description={t('settingsVaultDesc')}
      icon={<Shield size={18} className="text-primary" />}
    >
      <div className="space-y-4">
        <HiddenFileInput
          ref={fileInputRef}
          onChange={(event) => {
            void onFileChange(event)
          }}
          accept=".json,application/json"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button variant="outline" onClick={onImport} className="flex gap-2">
            <Upload size={16} />
            {t('settingsImportVault')}
          </Button>
          <Button variant="outline" onClick={onExport} className="flex gap-2">
            <Download size={16} />
            {t('settingsExportVault')}
          </Button>
        </div>
      </div>
    </SettingsSectionCard>
  )
})

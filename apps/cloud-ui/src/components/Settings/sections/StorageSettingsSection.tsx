import { Eraser, Info, Trash2 } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { CountUp } from '@/components/bits/CountUp'
import type { PlaybackSession } from '@/lib/db/types'
import { formatBytes, formatFileSizeStructured, formatTimestamp } from '@/lib/formatters'
import { Button } from '../../ui/button'
import { Progress } from '../../ui/progress'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface BrowserStorageInfo {
  usage: number
  quota: number
  available: number
  percentage: number
}

interface StorageInfo {
  indexedDB: {
    totalSize: number
  }
  browser: BrowserStorageInfo | null
}

interface StorageSettingsSectionProps {
  storageInfo: StorageInfo | null
  sessions: PlaybackSession[]
  language: string
  isClearing: boolean
  onWipeCache: () => void
  onClearAllStorage: () => void
  onClearItemCache: (id: string) => void
  onDeleteItem: (id: string) => void
}

export const StorageSettingsSection = memo(function StorageSettingsSection({
  storageInfo,
  sessions,
  language,
  isClearing,
  onWipeCache,
  onClearAllStorage,
  onClearItemCache,
  onDeleteItem,
}: StorageSettingsSectionProps) {
  const { t } = useTranslation()

  const { value, unit } = formatFileSizeStructured(storageInfo?.indexedDB.totalSize ?? 0)

  return (
    <SettingsSectionCard
      title={t('settingsStorageOverview')}
      description={
        <span className="flex items-center gap-1.5 flex-wrap">
          {t('settingsStorageUsageDescPrefix', { defaultValue: 'Managing' })}{' '}
          <span className="font-bold text-foreground">
            <CountUp to={value} precision={value % 1 !== 0 ? 1 : 0} /> {unit}
          </span>{' '}
          {t('settingsStorageUsageDescSuffix', { defaultValue: 'of cached data' })}
        </span>
      }
      contentClassName="space-y-6"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{t('storageQuotaTitle')}</div>
          <Button
            size="sm"
            variant="outline"
            onClick={onWipeCache}
            disabled={!storageInfo?.browser || isClearing}
            className="flex items-center gap-2"
          >
            <Eraser size={14} />
            {t('storageQuotaWipe')}
          </Button>
        </div>

        {storageInfo?.browser ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm" id="storage-quota-label">
              <span className="font-medium">{t('storageQuotaUsed')}</span>
              <span className="text-muted-foreground">
                {formatBytes(storageInfo.browser.usage)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{t('storageQuotaTotal')}</span>
              <span className="text-muted-foreground">
                {formatBytes(storageInfo.browser.quota)}
              </span>
            </div>
            <Progress
              aria-labelledby="storage-quota-label"
              value={Math.min(storageInfo.browser.percentage, 100)}
            />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">{t('storageQuotaUnavailable')}</div>
        )}

        <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg flex gap-3 text-xs text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
          <Info size={16} className="shrink-0 mt-0.5" />
          <div>{t('settingsStorageNote')}</div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg flex gap-3 text-xs text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
          <Info size={16} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">{t('settingsLiteDataNoticeTitle')}</div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] leading-5">
              <li>{t('settingsLiteDataNoticeItemLocalOnly')}</li>
              <li>{t('settingsLiteDataNoticeItemNoSync')}</li>
              <li>{t('settingsLiteDataNoticeItemMayBeCleared')}</li>
              <li>{t('settingsLiteDataNoticeItemBestEffort')}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">{t('sidebarHistory')}</h4>
        <div className="max-h-96 overflow-y-auto border rounded-lg divide-y bg-card text-card-foreground">
          {sessions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {t('settingsNoHistory')}
            </div>
          ) : (
            sessions.map((item) => (
              <div
                key={item.id}
                className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1 pe-4">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                    <span>{formatTimestamp(item.lastPlayedAt, language)}</span>
                    <span>•</span>
                    <span className="capitalize">
                      {item.source === 'local' ? t('sourceLocal') : t('sourcePodcast')}
                    </span>
                    <span>•</span>
                    <span>{formatBytes(item.sizeBytes)}</span>
                    {item.hasAudioBlob ? (
                      <span className="text-primary font-medium tracking-tight">
                        {t('settingsSaved')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('settingsNotSaved')}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {item.hasAudioBlob && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => onClearItemCache(item.id)}
                      title={t('ariaRemoveDownloadedAudio')}
                    >
                      <Eraser size={14} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => onDeleteItem(item.id)}
                    title={t('ariaDelete')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pt-4">
        <Button
          onClick={onClearAllStorage}
          disabled={isClearing || sessions.length === 0}
          variant="outline"
          className="w-full text-destructive border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
        >
          {isClearing ? t('loading') : t('settingsWipeAll')}
        </Button>
      </div>
    </SettingsSectionCard>
  )
})

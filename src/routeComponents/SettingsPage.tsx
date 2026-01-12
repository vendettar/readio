import { Eraser, Info, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { ConfirmAlertDialog } from '../components/ui/confirm-alert-dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { type Language, useI18n } from '../hooks/useI18n'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useSettingsData } from '../hooks/useSettingsData'
import { useStorageMaintenance } from '../hooks/useStorageMaintenance'
import { formatBytes, formatTimestamp } from '../libs/formatters'
import { ACCENT_OPTIONS, useThemeStore } from '../store/themeStore'

export default function SettingsPage() {
  const { t, language, setLanguage, languages } = useI18n()
  const { accent, setAccent } = useThemeStore()

  // Data loading hook
  const { storageInfo, sessions, reload } = useSettingsData()

  // Storage actions hook
  const { deleteSession, clearSessionCache, wipeAll, isClearing } = useStorageMaintenance({
    reload,
    t,
  })

  // Confirmation dialog hook
  const { state: confirmState, openConfirm } = useConfirmDialog()

  const handleDeleteItem = (id: string) => {
    openConfirm({
      title: t('commonDelete'),
      description: t('settingsConfirmDeleteSession'),
      variant: 'destructive',
      confirmLabel: t('commonDelete'),
      cancelLabel: t('commonCancel'),
      onConfirm: () => deleteSession(id),
    })
  }

  const handleClearItemCache = (id: string) => {
    openConfirm({
      title: t('settingsWipeAll'),
      description: t('settingsConfirmClearCache'),
      variant: 'destructive',
      confirmLabel: t('commonDelete'),
      cancelLabel: t('commonCancel'),
      onConfirm: () => clearSessionCache(id),
    })
  }

  const handleClearAllStorage = () => {
    openConfirm({
      title: t('settingsWipeAll'),
      description: t('settingsConfirmWipeAll'),
      variant: 'destructive',
      confirmLabel: t('commonDelete'),
      cancelLabel: t('commonCancel'),
      onConfirm: wipeAll,
    })
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({ isModalOpen: false })

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="px-12 py-14 max-w-screen-2xl mx-auto min-h-full">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-3">{t('settings')}</h1>
          <p className="text-xl text-muted-foreground font-medium">{t('settingsSubtitle')}</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            {/* Theme Settings Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('settingsAppearance')}</CardTitle>
                <CardDescription>{t('settingsAppearanceDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Accent Color */}
                <div className="space-y-3">
                  <Label>{t('settingsAccentColor')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_OPTIONS.map((a) => (
                      <Button
                        key={a.name}
                        variant="ghost"
                        size="icon"
                        onClick={() => setAccent(a.name)}
                        className={cn(
                          'w-8 h-8 rounded-full p-0 hover:bg-transparent',
                          accent === a.name
                            ? 'ring-2 ring-offset-2 ring-primary scale-110'
                            : 'opacity-70 hover:opacity-100'
                        )}
                        title={a.name}
                      >
                        <div className={cn('w-full h-full rounded-full', a.swatchClassName)} />
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* General Settings Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('settingsGeneral')}</CardTitle>
                <CardDescription>{t('settingsGeneralDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Language Selection */}
                <div className="space-y-3">
                  <Label>{t('ariaLanguage')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(languages).map(([code, name]) => (
                      <Button
                        key={code}
                        variant={language === code ? 'default' : 'outline'}
                        onClick={() => setLanguage(code as Language)}
                        className="justify-start"
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Auto Scroll */}
                <div className="flex items-center space-x-3">
                  <Checkbox id="auto-scroll" defaultChecked />
                  <Label htmlFor="auto-scroll" className="cursor-pointer">
                    {t('settingsAutoScroll')}
                  </Label>
                </div>
              </CardContent>
            </Card>

            {/* API Keys Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('settingsApiKeys')}</CardTitle>
                <CardDescription>{t('settingsApiKeysDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="openai-key">{t('settingsOpenAiKey')}</Label>
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-..."
                    className="max-w-md"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Storage Overview Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('settingsStorageOverview')}</CardTitle>
                <CardDescription>
                  {t('settingsStorageUsageDesc', {
                    size: formatBytes(storageInfo?.indexedDB.totalSize ?? 0),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {storageInfo?.browser && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{t('settingsTotalUsage')}</span>
                      <span className="text-muted-foreground">
                        {formatBytes(storageInfo.browser.usage)} /{' '}
                        {formatBytes(storageInfo.browser.quota)}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500 w-[var(--storage-percent)]"
                        style={
                          {
                            '--storage-percent': `${Math.min(storageInfo.browser.percentage, 100)}% `,
                          } as CSSProperties
                        }
                      />
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg flex gap-3 text-xs text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                      <Info size={16} className="shrink-0 mt-0.5" />
                      <div>{t('settingsStorageNote')}</div>
                    </div>
                  </div>
                )}

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
                          <div className="min-w-0 flex-1 pr-4">
                            <div className="text-sm font-medium truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                              <span>{formatTimestamp(item.lastPlayedAt, language)}</span>
                              <span>•</span>
                              <span className="capitalize">
                                {item.source === 'local'
                                  ? t('sourceLocal')
                                  : item.source === 'gallery'
                                    ? t('sourcePodcast')
                                    : item.source}
                              </span>
                              <span>•</span>
                              <span>{formatBytes(item.sizeBytes)}</span>
                              {item.hasAudioBlob ? (
                                <span className="text-primary font-medium tracking-tight">
                                  {t('settingsSaved')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  {t('settingsNotSaved')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {item.hasAudioBlob && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleClearItemCache(item.id)}
                                title={t('ariaRemoveDownloadedAudio')}
                              >
                                <Eraser size={14} />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteItem(item.id)}
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
                    onClick={handleClearAllStorage}
                    disabled={isClearing || sessions.length === 0}
                    variant="outline"
                    className="w-full text-destructive border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
                  >
                    {isClearing ? t('loading') : t('settingsWipeAll')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmAlertDialog {...confirmState} />
    </div>
  )
}

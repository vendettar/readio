import { Link } from '@tanstack/react-router'
import { Download, Eraser, ExternalLink, Info, Shield, Trash2, Upload } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { CountUp } from '../components/bits/CountUp'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { ConfirmAlertDialog } from '../components/ui/confirm-alert-dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../components/ui/form'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { useSettingsData } from '../hooks/useSettingsData'
import { useSettingsForm } from '../hooks/useSettingsForm'
import { useStorageMaintenance } from '../hooks/useStorageMaintenance'
import { formatBytes, formatFileSizeStructured, formatTimestamp } from '../lib/formatters'
import { generateOpml, parseOpml } from '../lib/opmlParser'
import { toast } from '../lib/toast'
import { type Language, languageNativeNames } from '../lib/translations'
import { exportVault, importVault } from '../lib/vault'
import { useExploreStore } from '../store/exploreStore'
import { ACCENT_OPTIONS, useThemeStore } from '../store/themeStore'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language.split('-')[0]
  const setLanguage = (lang: string) => i18n.changeLanguage(lang)
  const languages = languageNativeNames
  const { accent, setAccent } = useThemeStore()

  // OPML
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bulkSubscribe = useExploreStore((s) => s.bulkSubscribe)
  const subscriptions = useExploreStore((s) => s.subscriptions)

  const handleImportOpml = () => {
    fileInputRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const podcasts = parseOpml(text)
      if (podcasts.length === 0) {
        toast.errorKey('toastOpmlEmpty')
        return
      }
      await bulkSubscribe(podcasts)
      toast.successKey('toastOpmlImportSuccess')
    } catch (_err) {
      toast.errorKey('toastOpmlImportFailed')
    } finally {
      e.target.value = ''
    }
  }

  const handleExportOpml = () => {
    if (subscriptions.length === 0) {
      toast.errorKey('toastOpmlExportEmpty')
      return
    }

    try {
      const opml = generateOpml(subscriptions)
      const blob = new Blob([opml], { type: 'text/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `readio-subscriptions-${new Date().toISOString().split('T')[0]}.opml`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (_err) {
      toast.errorKey('toastOpmlExportFailed')
    }
  }

  // Vault
  const vaultInputRef = useRef<HTMLInputElement>(null)

  const handleExportVault = async () => {
    try {
      const vault = await exportVault()
      const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `readio-vault-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (_err) {
      toast.errorKey('toastVaultExportFailed')
    }
  }

  const handleImportVault = () => {
    vaultInputRef.current?.click()
  }

  const onVaultFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Pre-emptively clear input to allow selecting the same file again
    if (vaultInputRef.current) vaultInputRef.current.value = ''

    openConfirm({
      title: t('settingsVaultConfirmTitle'),
      description: t('settingsVaultConfirmDesc'),
      confirmLabel: t('settingsImportVault'),
      cancelLabel: t('commonCancel'),
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const text = await file.text()
          const json = JSON.parse(text)
          await importVault(json)
          toast.successKey('toastVaultImportSuccess')
          reload() // Refresh settings data
        } catch (_err) {
          toast.errorKey('toastVaultImportFailed')
        }
      },
    })
  }

  // Settings form with validation
  const { form, onSubmit, handleFieldBlur } = useSettingsForm()

  // Data loading hook
  const { storageInfo, sessions, reload } = useSettingsData()

  // Storage actions hook
  const { deleteSession, clearSessionCache, wipeAll, isClearing } = useStorageMaintenance({
    reload,
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

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="px-page pt-page pb-32 max-w-content mx-auto min-h-full">
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

            {/* Migration Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('settingsMigration')}</CardTitle>
                <CardDescription>{t('settingsMigrationDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={onFileChange}
                  accept=".opml,.xml,text/xml"
                  className="hidden"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Button variant="outline" onClick={handleImportOpml} className="flex gap-2">
                    <Upload size={16} />
                    {t('settingsImportOpml')}
                  </Button>
                  <Button variant="outline" onClick={handleExportOpml} className="flex gap-2">
                    <Download size={16} />
                    {t('settingsExportOpml')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Personal Vault Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-primary" />
                  <CardTitle className="text-lg">{t('settingsVault')}</CardTitle>
                </div>
                <CardDescription>{t('settingsVaultDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="file"
                  ref={vaultInputRef}
                  onChange={onVaultFileChange}
                  accept=".json,application/json"
                  className="hidden"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Button variant="outline" onClick={handleImportVault} className="flex gap-2">
                    <Upload size={16} />
                    {t('settingsImportVault')}
                  </Button>
                  <Button variant="outline" onClick={handleExportVault} className="flex gap-2">
                    <Download size={16} />
                    {t('settingsExportVault')}
                  </Button>
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
                <Form {...form}>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      onSubmit()
                    }}
                  >
                    <FormField
                      control={form.control}
                      name="openAiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('settingsOpenAiKey')}</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder={t('placeholderApiKey')}
                              className="max-w-md"
                              {...field}
                              onBlur={() => {
                                field.onBlur()
                                handleFieldBlur()
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="proxyUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('proxyUrlLabel')}</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder={t('proxyUrlPlaceholder')}
                              className="max-w-md"
                              {...field}
                              onBlur={() => {
                                field.onBlur()
                                handleFieldBlur()
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Legal Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('settingsLegal')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
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
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Storage Overview Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('settingsStorageOverview')}</CardTitle>
                <CardDescription>
                  {(() => {
                    const { value, unit } = formatFileSizeStructured(
                      storageInfo?.indexedDB.totalSize ?? 0
                    )
                    return (
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {t('settingsStorageUsageDescPrefix', { defaultValue: 'Managing' })}{' '}
                        <span className="font-bold text-foreground">
                          <CountUp to={value} precision={value % 1 !== 0 ? 1 : 0} /> {unit}
                        </span>{' '}
                        {t('settingsStorageUsageDescSuffix', { defaultValue: 'of cached data' })}
                      </span>
                    )
                  })()}
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
                          <div className="min-w-0 flex-1 pe-4">
                            <div className="text-sm font-medium truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                              <span>{formatTimestamp(item.lastPlayedAt, language)}</span>
                              <span>•</span>
                              <span className="capitalize">
                                {item.source === 'local'
                                  ? t('sourceLocal')
                                  : item.source === 'explore'
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

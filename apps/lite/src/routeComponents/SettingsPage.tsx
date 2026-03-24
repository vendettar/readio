import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader, PageShell } from '../components/layout'
import { SettingsSectionCard } from '../components/Settings/SettingsSectionCard'
import { AppearanceSettingsSection } from '../components/Settings/sections/AppearanceSettingsSection'
import { AsrSettingsSection } from '../components/Settings/sections/AsrSettingsSection'
import { CorsProxySettingsSection } from '../components/Settings/sections/CorsProxySettingsSection'
import { GeneralSettingsSection } from '../components/Settings/sections/GeneralSettingsSection'
import { LegalSettingsSection } from '../components/Settings/sections/LegalSettingsSection'
import { ConfirmAlertDialog } from '../components/ui/confirm-alert-dialog'
import { SUPPORTED_CONTENT_REGIONS } from '../constants/app'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { useSettingsData } from '../hooks/useSettingsData'
import { useSettingsForm } from '../hooks/useSettingsForm'
import { changeLanguageSafely } from '../lib/i18n'
import { type Language, languageNativeNames } from '../lib/translations'
import { useExploreStore } from '../store/exploreStore'
import { ACCENT_OPTIONS, useThemeStore } from '../store/themeStore'

/**
 * Format export filenames as yyyy-MM-dd in either system timezone (default)
 * or an explicitly provided IANA timezone for deterministic testing.
 */
export function formatExportDateSuffix(date: Date, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error('Failed to format export date suffix')
  }
  return `${year}-${month}-${day}`
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const language = (i18n.resolvedLanguage ?? i18n.language).split('-')[0]
  const setLanguage = useCallback((lang: Language) => {
    void changeLanguageSafely(lang)
  }, [])
  const languages = languageNativeNames

  // Use atomic selectors (not destructuring) to avoid subscribing to entire store
  const accent = useThemeStore((s) => s.accent)
  const setAccent = useThemeStore((s) => s.setAccent)

  const country = useExploreStore((s) => s.country)
  const setCountry = useExploreStore((s) => s.setCountry)

  // Settings form with validation
  const { credentialsLoaded, loadError, form, handleFieldBlur, handleAsrFieldBlur } =
    useSettingsForm()

  // Data loading hook
  const { sessions } = useSettingsData()

  // Confirmation dialog hook
  const { state: confirmState } = useConfirmDialog()

  const handleAccentChange = useCallback(
    (value: string) => setAccent(value as Parameters<typeof setAccent>[0]),
    [setAccent]
  )
  const handleLanguageChange = useCallback(
    (value: string) => setLanguage(value as Language),
    [setLanguage]
  )

  return (
    <PageShell>
      <PageHeader
        title={t('settings')}
        subtitle={t('settingsSubtitle')}
        className="bg-card/50 border border-border/50 p-6 sm:p-8 shadow-sm rounded-2xl"
        meta={
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground">
              LANG: {String(language).toUpperCase()}
            </span>
            <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground">
              {t('settingsContentRegion')}: {String(country).toUpperCase()}
            </span>
            <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground">
              {t('sidebarHistory')}: {sessions.length}
            </span>
          </div>
        }
      />

      <div className="space-y-12">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] gap-7 xl:gap-8">
          <div className="space-y-6">
            <AppearanceSettingsSection
              accent={accent}
              accentOptions={ACCENT_OPTIONS}
              onAccentChange={handleAccentChange}
            />

            <GeneralSettingsSection
              language={language}
              languages={languages}
              country={country}
              supportedRegions={SUPPORTED_CONTENT_REGIONS}
              onLanguageChange={handleLanguageChange}
              onCountryChange={setCountry}
            />

            {/* TODO(settings): restore the Migration block when its product requirements are defined again. */}
            {/* <MigrationSettingsSection
              fileInputRef={fileInputRef}
              onFileChange={onFileChange}
              onImport={handleImportOpml}
              onExport={handleExportOpml}
            /> */}

            {/* TODO(settings): restore the Personal Vault block when its product requirements are defined again. */}
            {/* <VaultSettingsSection
              fileInputRef={vaultInputRef}
              onFileChange={onVaultFileChange}
              onImport={handleImportVault}
              onExport={handleExportVault}
            /> */}

            {loadError ? (
              <SettingsSectionCard
                title={t('settingsAiServices')}
                description={t('settingsAiServicesDesc')}
              >
                <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                  <p className="font-medium mb-1">{t('settingsLoadError')}</p>
                  <p>{loadError.message}</p>
                </div>
              </SettingsSectionCard>
            ) : credentialsLoaded ? (
              <>
                <div id="asr">
                  <AsrSettingsSection form={form} onFieldBlur={handleAsrFieldBlur} />
                </div>
                {/* TODO(settings): restore the Translation & AI block when its product requirements are defined again. */}
                {/* <TranslateApiKeysSettingsSection
                  form={form}
                  onSubmit={onSubmit}
                  onFieldBlur={handleFieldBlur}
                /> */}
                {/* TODO(settings): restore the Dictionary Lookup block when its product requirements are defined again. */}
                {/* <DictionarySettingsSection form={form} onFieldBlur={handleFieldBlur} /> */}
                <CorsProxySettingsSection form={form} onFieldBlur={handleFieldBlur} />
              </>
            ) : (
              <SettingsSectionCard
                title={t('settingsAiServices')}
                description={t('settingsAiServicesDesc')}
              >
                <div className="text-sm text-muted-foreground">{t('loading')}</div>
              </SettingsSectionCard>
            )}

            {/* TODO(settings): restore the Integrity Maintenance block when its product requirements are defined again. */}
            {/* <MaintenanceSettingsSection
              isRunning={isIntegrityRunning}
              lastReport={lastReport}
              onRunNow={runNow}
              language={language}
            /> */}

            {/* TODO(settings): restore the Diagnostic Tools block when its product requirements are defined again. */}
            {/* <DiagnosticsSettingsSection onDownloadLogs={handleDownloadLogs} /> */}

            <LegalSettingsSection />
          </div>

          <div className="space-y-6">
            {/* TODO(settings): restore the Storage Overview block when its product requirements are defined again. */}
            {/* <div className="xl:sticky xl:top-6">
              <StorageSettingsSection
                storageInfo={storageInfo}
                sessions={sessions}
                language={language}
                isClearing={isClearing}
                onWipeCache={handleWipeCache}
                onClearAllStorage={handleClearAllStorage}
                onClearItemCache={handleClearItemCache}
                onDeleteItem={handleDeleteItem}
              />
            </div> */}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmAlertDialog {...confirmState} />
    </PageShell>
  )
}

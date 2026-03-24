import { useTranslation } from 'react-i18next'
import { formatDateStandard } from '@/lib/dateUtils'

export default function PrivacyPage() {
  const { t } = useTranslation()
  const today = formatDateStandard(Date.now())

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="px-page pt-page pb-32 max-w-content mx-auto min-h-full">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-3">{t('privacyTitle')}</h1>
          <p className="text-xl text-muted-foreground font-medium">
            {t('legalLastUpdated', { date: today })}
          </p>
        </header>

        <article className="prose dark:prose-invert max-w-none">
          <section className="mb-8">
            <p>{t('privacyIntro')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">{t('legalDataCollectionTitle')}</h2>
            <p>{t('legalDataCollectionBody')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">{t('legalStorageTitle')}</h2>
            <p>{t('privacyDataLocal')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">{t('legalThirdPartyTitle')}</h2>
            <p>{t('privacyThirdParty')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">{t('legalOfflineTitle')}</h2>
            <p>{t('legalOfflineBody')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">{t('legalContactTitle')}</h2>
            <p>{t('legalContactBody')}</p>
          </section>
        </article>
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

export default function TopEpisodeResolutionPage() {
  const { t } = useTranslation()

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          <div className="w-40 sm:w-48 md:w-64 aspect-square bg-muted rounded-2xl animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">{t('loading')}</p>
            <div className="h-8 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-5 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
            <div className="flex gap-3 pt-4">
              <div className="h-10 w-32 bg-muted rounded animate-pulse" />
              <div className="h-10 w-10 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('loadingEpisodes')}</p>
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PodcastEpisodesGrid } from '../components/Explore/PodcastEpisodesGrid'
import { PodcastShowsCarousel } from '../components/Explore/PodcastShowsCarousel'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { LoadingPage } from '../components/ui/loading-spinner'
import { useEditorPicks, useTopEpisodes, useTopPodcasts } from '../hooks/useDiscoveryPodcasts'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

export default function ExplorePage() {
  const { t } = useTranslation()

  // Network status
  const { isOnline } = useNetworkStatus()

  // Data fetching
  const { data: editorPicks, isLoading: isLoadingPicks } = useEditorPicks('us')
  const { data: topShows, isLoading: isLoadingShows } = useTopPodcasts('us', 30)
  const { data: topEpisodes, isLoading: isLoadingEpisodes } = useTopEpisodes('us', 30)

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="w-full max-w-content mx-auto px-page pt-page pb-14 min-h-full">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            {t('exploreTitle')}
          </h1>
          <p className="text-lg text-muted-foreground">{t('exploreSubtitle')}</p>
        </header>

        {!isOnline && (
          <div className="py-10">
            <p className="text-muted-foreground mb-4">{t('offline.badge')}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link to="/subscriptions" className="font-medium text-primary hover:underline">
                {t('sidebarSubscriptions')}
              </Link>
              <Link to="/favorites" className="font-medium text-primary hover:underline">
                {t('sidebarFavorites')}
              </Link>
              <Link to="/history" className="font-medium text-primary hover:underline">
                {t('sidebarHistory')}
              </Link>
              <Link to="/files" className="font-medium text-primary hover:underline">
                {t('navFiles')}
              </Link>
            </div>
          </div>
        )}

        {isOnline && (
          <>
            {/* Global Loading State - fulfill instruction 012 requirement */}
            {isLoadingPicks && isLoadingShows && isLoadingEpisodes ? (
              <LoadingPage />
            ) : !editorPicks?.length &&
              !topShows?.length &&
              !topEpisodes?.length &&
              !isLoadingPicks &&
              !isLoadingShows &&
              !isLoadingEpisodes ? (
              <EmptyState
                icon={Compass}
                title={t('noResults')}
                description={t('errorNetwork')}
                action={
                  <Button onClick={() => window.location.reload()}>{t('modalCrashedRetry')}</Button>
                }
              />
            ) : (
              /* Content Sections */
              <div className="space-y-12">
                {/* Module D: Editor's Picks - Only show if region has configured picks */}
                {editorPicks && editorPicks.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold mb-4">{t('editorPicksTitle')}</h2>
                    <PodcastShowsCarousel
                      podcasts={editorPicks}
                      isLoading={isLoadingPicks}
                      sectionId="editorsPicks"
                    />
                  </section>
                )}

                {/* Top Shows */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">{t('topShowsTitle')}</h2>
                  </div>
                  <PodcastShowsCarousel
                    podcasts={topShows || []}
                    isLoading={isLoadingShows}
                    sectionId="topShows"
                  />
                </section>

                {/* Top Episodes */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">{t('topEpisodesTitle')}</h2>
                  </div>
                  <PodcastEpisodesGrid episodes={topEpisodes || []} isLoading={isLoadingEpisodes} />
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

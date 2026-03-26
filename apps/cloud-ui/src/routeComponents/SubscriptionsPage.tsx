import { Link, useNavigate } from '@tanstack/react-router'
import { Compass, LayoutGrid } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PodcastCard } from '../components/PodcastCard/PodcastCard'
import { PodcastGrid } from '../components/PodcastGrid'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { LoadingPage } from '../components/ui/loading-spinner'
import type { Subscription } from '../lib/db/types'
import { buildPodcastShowRoute, normalizeCountryParam } from '../lib/routes/podcastRoutes'
import { useExploreStore } from '../store/exploreStore'

export default function SubscriptionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Use atomic selectors (not destructuring) to avoid subscribing to entire store
  const subscriptions = useExploreStore((s) => s.subscriptions)
  const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded)

  // subscriptionsLoaded is monotonic (false→true, never reverts) — no extra state needed
  const isInitialLoading = !subscriptionsLoaded

  const handlePodcastClick = (subscription: Subscription) => {
    const persistedCountry = normalizeCountryParam(subscription.countryAtSave)
    if (!persistedCountry) return

    const route = buildPodcastShowRoute({
      country: persistedCountry,
      podcastId: subscription.providerPodcastId ?? '',
    })

    // Navigate only when persisted route context exists.
    if (route) {
      void navigate(route)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-page pt-page pb-32 max-w-content mx-auto min-h-full">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">
            {t('subscriptionsTitle')}
          </h1>
        </header>

        {/* Loading */}
        {isInitialLoading && <LoadingPage />}

        {/* Empty state */}
        {!isInitialLoading && subscriptions.length === 0 && (
          <EmptyState
            icon={LayoutGrid}
            title={t('onboarding.subscriptions.title')}
            description={t('onboarding.subscriptions.desc')}
            action={
              <Button asChild>
                <Link to="/explore">
                  <Compass className="w-4 h-4 me-2" />
                  {t('onboarding.subscriptions.cta')}
                </Link>
              </Button>
            }
          />
        )}

        {/* Subscriptions grid */}
        {!isInitialLoading && subscriptions.length > 0 && (
          <PodcastGrid>
            {subscriptions.map((subscription) => {
              const persistedCountry = normalizeCountryParam(subscription.countryAtSave)
              const showRoute = buildPodcastShowRoute({
                country: persistedCountry,
                podcastId: subscription.providerPodcastId ?? '',
              })

              return (
                <PodcastCard
                  key={subscription.feedUrl}
                  id={subscription.feedUrl}
                  title={subscription.title}
                  subtitle={subscription.author}
                  artworkUrl={subscription.artworkUrl}
                  {...(showRoute
                    ? {
                        to: showRoute.to,
                        params: showRoute.params,
                      }
                    : {
                        onClick: () => handlePodcastClick(subscription),
                      })}
                />
              )
            })}
          </PodcastGrid>
        )}
      </div>
    </div>
  )
}

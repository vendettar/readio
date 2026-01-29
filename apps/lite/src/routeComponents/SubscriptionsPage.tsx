import { Link, useNavigate } from '@tanstack/react-router'
import { CircleMinus, Compass, LayoutGrid } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PodcastCard } from '../components/PodcastCard/PodcastCard'
import { PodcastGrid } from '../components/PodcastGrid'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { LoadingPage } from '../components/ui/loading-spinner'

import type { Subscription } from '../lib/dexieDb'
import { useExploreStore } from '../store/exploreStore'

export default function SubscriptionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { subscriptions, subscriptionsLoaded, unsubscribe } = useExploreStore()
  const [isInitialLoading, setIsInitialLoading] = useState(!subscriptionsLoaded)

  // Loading state (subscriptions are loaded globally by useAppInitialization)
  useEffect(() => {
    if (subscriptionsLoaded) {
      setIsInitialLoading(false)
    }
  }, [subscriptionsLoaded])

  const handlePodcastClick = (subscription: Subscription) => {
    // Navigate to podcast detail page using providerPodcastId if available
    if (subscription.providerPodcastId) {
      navigate({ to: '/podcast/$id', params: { id: subscription.providerPodcastId } })
    } else if (subscription.feedUrl) {
      // Fallback search
      navigate({ to: '/search', search: { q: subscription.title } })
    }
  }

  const handleUnsubscribe = async (feedUrl: string) => {
    await unsubscribe(feedUrl)
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
            {subscriptions.map((subscription) => (
              <PodcastCard
                key={subscription.feedUrl}
                id={subscription.feedUrl}
                title={subscription.title}
                subtitle={subscription.author}
                artworkUrl={subscription.artworkUrl}
                {...(subscription.providerPodcastId
                  ? {
                      to: '/podcast/$id',
                      params: { id: subscription.providerPodcastId },
                    }
                  : {
                      onClick: () => handlePodcastClick(subscription),
                    })}
                menuItems={[
                  {
                    label: t('unsubscribe'),
                    icon: <CircleMinus size={14} />,
                    onClick: () => handleUnsubscribe(subscription.feedUrl),
                    variant: 'destructive' as const,
                  },
                ]}
              />
            ))}
          </PodcastGrid>
        )}
      </div>
    </div>
  )
}

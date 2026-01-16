// src/routes/subscriptions.tsx
import { useNavigate } from '@tanstack/react-router'
import { CircleMinus, LayoutGrid } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PodcastCard } from '../components/PodcastCard/PodcastCard'
import { useI18n } from '../hooks/useI18n'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import type { Subscription } from '../lib/dexieDb'
import { useExploreStore } from '../store/exploreStore'

export default function SubscriptionsPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { subscriptions, subscriptionsLoaded, unsubscribe } = useExploreStore()
  const [isInitialLoading, setIsInitialLoading] = useState(!subscriptionsLoaded)

  // Keyboard shortcuts
  useKeyboardShortcuts({ isModalOpen: false })

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
      <div className="px-[var(--page-margin-x)] pt-[var(--page-margin-x)] pb-32 max-w-content mx-auto min-h-full">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">
            {t('subscriptionsTitle')}
          </h1>
        </header>

        {/* Loading */}
        {isInitialLoading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isInitialLoading && subscriptions.length === 0 && (
          <div className="mt-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
              <LayoutGrid className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">{t('subscriptionsEmpty')}</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">{t('subscriptionsEmptyDesc')}</p>
          </div>
        )}

        {/* Subscriptions grid */}
        {!isInitialLoading && subscriptions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
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
          </div>
        )}
      </div>
    </div>
  )
}

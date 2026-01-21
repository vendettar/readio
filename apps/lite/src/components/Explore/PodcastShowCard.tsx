// src/components/Explore/PodcastShowCard.tsx

import { CircleMinus, CirclePlus } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { DiscoveryPodcast } from '../../lib/discovery'
import { useExploreStore } from '../../store/exploreStore'
import { PodcastCard } from '../PodcastCard/PodcastCard'

interface TopShowCardProps {
  podcast: DiscoveryPodcast
  index: number
  onPlayLatest?: (podcast: DiscoveryPodcast) => void
  onSubscribe?: (podcast: DiscoveryPodcast) => void
}

/**
 * 极简、高性能的卡片组件。
 */
export const PodcastShowCard = React.memo(
  ({ podcast, index, onPlayLatest, onSubscribe }: TopShowCardProps) => {
    const { t } = useTranslation()
    const subscriptions = useExploreStore((state) => state.subscriptions)

    // Check by providerPodcastId or feedUrl
    const subscribed = subscriptions.some(
      (s) =>
        (podcast.id && s.providerPodcastId === podcast.id) ||
        (podcast.feedUrl && s.feedUrl === podcast.feedUrl)
    )

    return (
      <PodcastCard
        id={podcast.id}
        title={podcast.name}
        subtitle={podcast.artistName}
        artworkUrl={podcast.artworkUrl100 || ''}
        rank={index + 1}
        className="flex-shrink-0 w-[var(--item-width)] snap-start"
        onPlay={onPlayLatest ? () => onPlayLatest(podcast) : undefined}
        menuItems={[
          {
            label: subscribed ? t('unsubscribe') : t('subscribe'),
            icon: subscribed ? <CircleMinus size={14} /> : <CirclePlus size={14} />,
            onClick: () => onSubscribe?.(podcast),
          },
        ]}
      />
    )
  }
)

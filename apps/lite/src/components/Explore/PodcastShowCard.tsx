import React from 'react'
import type { DiscoveryPodcast } from '../../lib/discovery'
import { PodcastCard } from '../PodcastCard/PodcastCard'

// src/components/Explore/PodcastShowCard.tsx

interface TopShowCardProps {
  podcast: DiscoveryPodcast
  index: number
  search?: Record<string, unknown>
}

/**
 * 极简、高性能的卡片组件。
 */
export const PodcastShowCard = React.memo(({ podcast, index, search }: TopShowCardProps) => {
  return (
    <PodcastCard
      id={podcast.id}
      title={podcast.name}
      subtitle={podcast.artistName}
      artworkUrl={podcast.artworkUrl100 || ''}
      rank={index + 1}
      className="flex-shrink-0 w-[var(--item-width)] snap-start"
      search={search}
    />
  )
})

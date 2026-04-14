import React from 'react'
import type { DiscoveryPodcast } from '../../lib/discovery'
import { getCanonicalEditorPickPodcastID } from '../../lib/discovery/editorPicks'
import { buildPodcastShowRoute, normalizeCountryParam } from '../../lib/routes/podcastRoutes'
import { useExploreStore } from '../../store/exploreStore'
import { PodcastCard } from '../PodcastCard/PodcastCard'

// src/components/Explore/PodcastShowCard.tsx

interface TopShowCardProps {
  podcast: DiscoveryPodcast
  index: number
  transitionState?: {
    fromLayoutPrefix: string
  }
}

/**
 * 极简、高性能的卡片组件。
 */
export const PodcastShowCard = React.memo(
  ({ podcast, index, transitionState }: TopShowCardProps) => {
    const globalCountry = normalizeCountryParam(useExploreStore((s) => s.country))
    const canonicalPodcastId = getCanonicalEditorPickPodcastID(podcast)
    const showRoute = canonicalPodcastId
      ? buildPodcastShowRoute({
          country: globalCountry,
          podcastId: canonicalPodcastId,
        })
      : null
    const routeState = podcast.podcastGuid
      ? {
          ...(transitionState ?? {}),
          editorPickSnapshot: podcast,
        }
      : transitionState

    return (
      <PodcastCard
        id={podcast.id}
        title={podcast.title}
        subtitle={podcast.author}
        artworkUrl={podcast.image || podcast.artwork || ''}
        rank={index + 1}
        className="flex-shrink-0 w-[var(--item-width)] snap-start"
        to={showRoute?.to}
        params={showRoute?.params}
        state={routeState}
      />
    )
  }
)

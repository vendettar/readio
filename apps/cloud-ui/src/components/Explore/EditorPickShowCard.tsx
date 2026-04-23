import React from 'react'
import type { EditorPickPodcast } from '../../lib/discovery'
import { getCanonicalEditorPickPodcastID } from '../../lib/discovery/editorPicks'
import { buildPodcastShowRoute, normalizeCountryParam } from '../../lib/routes/podcastRoutes'
import { useExploreStore } from '../../store/exploreStore'
import { PodcastCard } from '../PodcastCard/PodcastCard'

// src/components/Explore/EditorPickShowCard.tsx

interface EditorPickShowCardProps {
  podcast: EditorPickPodcast
  index: number
  transitionState?: {
    fromLayoutPrefix: string
  }
}

/**
 * Specialized card for Editor's Picks that supports snapshot transitions and GUID matching.
 */
export const EditorPickShowCard = React.memo(
  ({ podcast, index, transitionState }: EditorPickShowCardProps) => {
    const globalCountry = normalizeCountryParam(useExploreStore((s) => s.country))
    const canonicalPodcastId = getCanonicalEditorPickPodcastID(podcast)

    const showRoute = canonicalPodcastId
      ? buildPodcastShowRoute({
          country: globalCountry,
          podcastId: canonicalPodcastId,
        })
      : null

    // Editor picks carry a GUID and a snapshot for instant transition
    const routeState = {
      ...(transitionState ?? {}),
      editorPickSnapshot: podcast,
    }

    return (
      <PodcastCard
        id={podcast.podcastItunesId}
        title={podcast.title}
        subtitle={podcast.author}
        artworkUrl={podcast.artwork || ''}
        rank={index + 1}
        className="flex-shrink-0 w-[var(--item-width)] snap-start"
        to={showRoute?.to}
        params={showRoute?.params}
        state={routeState}
      />
    )
  }
)

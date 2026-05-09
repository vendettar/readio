import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { ensurePodcastDetail, ensurePodcastEpisodes } from '@/lib/discovery/queryCache'
import {
  compactKeyToEpisodeIdentity,
  episodeIdentityToCompactKey,
  isValidCompactKey,
} from '@/lib/routes/compactKey'
import { buildPodcastEpisodeRoute } from '@/lib/routes/podcastRoutes'

const episodeDetailSearchSchema = z.object({})

const episodeDetailParamSchema = z.object({
  id: z.string().regex(/^\d+$/),
  episodeKey: z.string().refine((val) => isValidCompactKey(val), {
    message: 'Episode param must be a valid compact episode key',
  }),
})

export const Route = createFileRoute('/podcast/$country/$id/$episodeKey')({
  validateSearch: (search) => episodeDetailSearchSchema.parse(search),
  beforeLoad: ({ params }) => {
    const result = episodeDetailParamSchema.safeParse(params)
    if (!result.success) {
      throw redirect({
        to: '/podcast/$country/$id',
        params: { country: params.country, id: params.id },
      })
    }
  },
  loader: async ({ params, context: { queryClient }, abortController }) => {
    const { country, id, episodeKey } = params

    // Canonical key enforcement: redirect to canonical URL if key or podcast ID doesn't match
    // Fetch podcast detail first to get the canonical itunes ID and authority metadata
    const podcast = await ensurePodcastDetail(queryClient, id, abortController.signal, country)
    if (!podcast) return

    const canonicalPodcastId = podcast.podcastItunesId
    const episodeListAuthority = {
      lastUpdateTime: podcast.lastUpdateTime,
      episodeCount: podcast.episodeCount,
    }

    // Fetch episodes to find the episode by identity
    const episodeList = await ensurePodcastEpisodes(queryClient, canonicalPodcastId, {
      signal: abortController.signal,
      authority: episodeListAuthority,
      country,
    })

    const targetEpisodeGuid = compactKeyToEpisodeIdentity(episodeKey) ?? ''
    const episode = episodeList.episodes.find((candidate) => candidate.guid === targetEpisodeGuid)

    if (!episode) return

    const canonicalKey = episodeIdentityToCompactKey(episode.guid)
    if (!canonicalKey) return

    if (episodeKey !== canonicalKey || id !== canonicalPodcastId) {
      const canonicalRoute = buildPodcastEpisodeRoute({
        country,
        podcastId: canonicalPodcastId,
        episodeKey: canonicalKey,
      })
      if (canonicalRoute) {
        throw redirect({
          ...canonicalRoute,
          replace: true,
        })
      }
    }
  },
  component: lazyRouteComponent(() => import('@/routeComponents/podcast/PodcastEpisodeDetailPage')),
})

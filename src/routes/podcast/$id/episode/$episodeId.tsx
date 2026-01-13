import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/podcast/$id/episode/$episodeId')({
  beforeLoad: ({ params }) => {
    const result = z
      .object({
        id: z.string().regex(/^\d+$/),
        episodeId: z.string().min(1),
      })
      .safeParse(params)
    if (!result.success) {
      throw redirect({ to: '/explore' })
    }
  },
  component: lazyRouteComponent(
    () => import('../../../../routeComponents/podcast/PodcastEpisodeDetailPage')
  ),
})

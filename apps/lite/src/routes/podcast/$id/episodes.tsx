import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/podcast/$id/episodes')({
  beforeLoad: ({ params }) => {
    const result = z.object({ id: z.string().regex(/^\d+$/) }).safeParse(params)
    if (!result.success) {
      throw redirect({ to: '/explore' })
    }
  },
  component: lazyRouteComponent(
    () => import('../../../routeComponents/podcast/PodcastEpisodesPage')
  ),
})

import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'

const episodesRouteSearchSchema = z.object({})

export const Route = createFileRoute('/$country/podcast/$id/episodes')({
  validateSearch: (search) => episodesRouteSearchSchema.parse(search),
  beforeLoad: ({ params }) => {
    const result = z.object({ id: z.string().regex(/^\d+$/) }).safeParse(params)
    if (!result.success) {
      throw redirect({ to: '/explore' })
    }
  },
  component: lazyRouteComponent(
    () => import('../../../../routeComponents/podcast/PodcastEpisodesPage')
  ),
})

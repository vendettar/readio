import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'

const topEpisodeResolutionSearchSchema = z.object({
  title: z.string().trim().min(1),
})

export const Route = createFileRoute('/podcast/$country/$id/top-episode')({
  validateSearch: (search) => topEpisodeResolutionSearchSchema.parse(search),
  beforeLoad: ({ params }) => {
    const result = z.object({ id: z.string().regex(/^\d+$/) }).safeParse(params)
    if (!result.success) {
      throw redirect({ to: '/explore' })
    }
  },
  component: lazyRouteComponent(() => import('@/routeComponents/podcast/TopEpisodeResolutionPage')),
})

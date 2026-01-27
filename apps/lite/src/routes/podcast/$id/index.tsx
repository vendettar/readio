import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/podcast/$id/')({
  validateSearch: (search) =>
    z
      .object({
        fromLayoutPrefix: z.string().optional(),
      })
      .parse(search),
  beforeLoad: ({ params }) => {
    const result = z.object({ id: z.string().regex(/^\d+$/) }).safeParse(params)
    if (!result.success) {
      throw redirect({ to: '/explore' })
    }
  },
  component: lazyRouteComponent(() => import('../../../routeComponents/podcast/PodcastShowPage')),
})

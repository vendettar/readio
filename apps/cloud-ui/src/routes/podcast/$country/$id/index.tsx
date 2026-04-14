import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { podcastShowSearchSchema } from '@/lib/discovery/libraryRouteSearch'

export const Route = createFileRoute('/podcast/$country/$id/')({
  validateSearch: (search) => podcastShowSearchSchema.parse(search),
  beforeLoad: ({ params }) => {
    const result = z.object({ id: z.string().regex(/^\d+$/) }).safeParse(params)
    if (!result.success) {
      throw redirect({ to: '/explore' })
    }
  },
  component: lazyRouteComponent(() => import('@/routeComponents/podcast/PodcastShowPage')),
})

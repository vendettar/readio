import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { isValidCompactKey } from '@/lib/routes/compactKey'

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
  component: lazyRouteComponent(() => import('@/routeComponents/podcast/PodcastEpisodeDetailPage')),
})

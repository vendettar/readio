import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { parseSlugWithId } from '../../../../../lib/slugUtils'

const episodeDetailRouteSearchSchema = z.object({})

const slugParamSchema = z.object({
  id: z.string().regex(/^\d+$/),
  episodeId: z.string().refine((val) => parseSlugWithId(val) !== null, {
    message: 'Episode param must be a valid slug with exact 8-char short ID suffix',
  }),
})

export const Route = createFileRoute('/$country/podcast/$id/episode/$episodeId')({
  validateSearch: (search) => episodeDetailRouteSearchSchema.parse(search),
  beforeLoad: ({ params }) => {
    const result = slugParamSchema.safeParse(params)
    if (!result.success) {
      throw redirect({
        to: '/$country/podcast/$id',
        params: { country: params.country, id: params.id },
      })
    }
  },
  component: lazyRouteComponent(
    () => import('../../../../../routeComponents/podcast/PodcastEpisodeDetailPage')
  ),
})

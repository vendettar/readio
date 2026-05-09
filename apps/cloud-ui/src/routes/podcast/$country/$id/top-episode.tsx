import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { resolveEpisodeByTitle } from '@/lib/routes/episodeResolver'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'

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
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps, context: { queryClient }, abortController }) => {
    const { country, id } = params
    const { title } = deps

    const normalizedCountry = normalizeCountryParam(country)
    const podcastItunesId = String(id ?? '').trim()
    const normalizedTitle = String(title ?? '').trim()

    if (!normalizedCountry || !podcastItunesId || !normalizedTitle) {
      throw redirect({ to: '/explore', replace: true })
    }

    const resolved = await resolveEpisodeByTitle({
      queryClient,
      country: normalizedCountry,
      podcastItunesId,
      targetTitle: normalizedTitle,
      signal: abortController.signal,
    })

    if (resolved.route) {
      throw redirect({
        ...resolved.route,
        replace: true,
      })
    }

    throw redirect({ to: '/explore', replace: true })
  },
  component: lazyRouteComponent(() => import('@/routeComponents/podcast/TopEpisodeResolutionPage')),
})

import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'
import { resolveEpisodeByTitle } from '@/lib/routes/episodeResolver'
import { buildPodcastShowRoute, normalizeCountryParam } from '@/lib/routes/podcastRoutes'

export default function TopEpisodeResolutionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { country, id } = useParams({ strict: false })
  const { title } = useSearch({ from: '/podcast/$country/$id/top-episode' })

  useEffect(() => {
    const normalizedCountry = normalizeCountryParam(country)
    const podcastItunesId = String(id ?? '').trim()
    const normalizedTitle = String(title ?? '').trim()

    if (!normalizedCountry || !podcastItunesId || !normalizedTitle) {
      void navigate({ to: '/explore', replace: true })
      return
    }

    const abortController = new AbortController()

    void (async () => {
      const resolved = await resolveEpisodeByTitle({
        queryClient,
        country: normalizedCountry,
        podcastItunesId,
        targetTitle: normalizedTitle,
        signal: abortController.signal,
      })

      if (abortController.signal.aborted) {
        return
      }

      if (resolved.route) {
        await navigate({
          ...resolved.route,
          replace: true,
        })
        return
      }

      const showRoute = buildPodcastShowRoute({
        country: normalizedCountry,
        podcastId: podcastItunesId,
      })
      if (showRoute) {
        await navigate({
          ...showRoute,
          replace: true,
        })
        return
      }

      await navigate({ to: '/explore', replace: true })
    })()

    return () => {
      abortController.abort()
    }
  }, [country, id, navigate, queryClient, title])

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          <div className="w-40 sm:w-48 md:w-64 aspect-square bg-muted rounded-2xl animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Opening...</p>
            <div className="h-8 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-5 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
            <div className="flex gap-3 pt-4">
              <div className="h-10 w-32 bg-muted rounded animate-pulse" />
              <div className="h-10 w-10 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Loading episode...</p>
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

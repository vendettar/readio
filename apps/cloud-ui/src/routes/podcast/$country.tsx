import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { debug } from '../../lib/logger'
import { normalizeCountryParam } from '../../lib/routes/podcastRoutes'

export const Route = createFileRoute('/podcast/$country')({
  beforeLoad: ({ params, location }) => {
    const normalizedCountry = normalizeCountryParam(params.country)

    if (!normalizedCountry) {
      debug('[podcast-country-route] Unsupported country parameter', {
        country: params.country,
        pathname: location.pathname,
      })
      throw redirect({ to: '/explore' })
    }

    if (params.country !== normalizedCountry) {
      const canonicalPath = location.pathname.replace(
        /^\/podcast\/[^/]+/,
        `/podcast/${normalizedCountry}`
      )
      debug('[podcast-country-route] Canonicalizing country parameter', {
        from: params.country,
        to: normalizedCountry,
        pathname: location.pathname,
      })
      throw redirect({
        to: canonicalPath as never,
        search: true,
        replace: true,
      })
    }
  },
  component: () => <Outlet />,
})

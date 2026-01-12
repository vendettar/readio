import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

interface SearchParams {
  q?: string
}

export const Route = createFileRoute('/search')({
  component: lazyRouteComponent(() => import('../routeComponents/SearchPage')),
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    return {
      q: typeof search.q === 'string' ? search.q : undefined,
    }
  },
})

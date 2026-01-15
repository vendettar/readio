import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/favorites')({
  component: lazyRouteComponent(() => import('../routeComponents/FavoritesPage')),
})

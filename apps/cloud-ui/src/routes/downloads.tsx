import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/downloads')({
  component: lazyRouteComponent(() => import('../routeComponents/DownloadsPage')),
})

import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/ops')({
  component: lazyRouteComponent(() => import('../routeComponents/AdminLogsPage')),
})

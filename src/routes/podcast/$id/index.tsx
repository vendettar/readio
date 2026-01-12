import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/podcast/$id/')({
  component: lazyRouteComponent(() => import('../../../routeComponents/podcast/PodcastShowPage')),
})

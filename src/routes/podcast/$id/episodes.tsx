import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/podcast/$id/episodes')({
  component: lazyRouteComponent(
    () => import('../../../routeComponents/podcast/PodcastEpisodesPage')
  ),
})

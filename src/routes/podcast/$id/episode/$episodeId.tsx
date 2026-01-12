import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/podcast/$id/episode/$episodeId')({
    component: lazyRouteComponent(() => import('../../../../routeComponents/podcast/PodcastEpisodeDetailPage')),
});

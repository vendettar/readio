import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/explore')({
    component: lazyRouteComponent(() => import('../routeComponents/ExplorePage')),
});

import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/history')({
    component: lazyRouteComponent(() => import('../routeComponents/HistoryPage')),
});

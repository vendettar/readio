import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/subscriptions')({
    component: lazyRouteComponent(() => import('../routeComponents/SubscriptionsPage')),
});

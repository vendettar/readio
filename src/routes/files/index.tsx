import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/files/')({
    component: lazyRouteComponent(() => import('../../routeComponents/files/FilesIndexPage')),
});

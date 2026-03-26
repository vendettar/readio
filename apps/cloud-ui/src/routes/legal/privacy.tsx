import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/legal/privacy')({
  component: lazyRouteComponent(() => import('../../routeComponents/legal/PrivacyPage')),
})

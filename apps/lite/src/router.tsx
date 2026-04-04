// src/router.tsx
import { createRouter } from '@tanstack/react-router'
import { RouteErrorFallback } from './components/RouteErrorFallback'
import { RouteNotFound } from './components/RouteNotFound'
import { RoutePending } from './components/RoutePending'
import { routeTree } from './routeTree.gen'

// Create the router instance
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultErrorComponent: RouteErrorFallback,
  defaultNotFoundComponent: RouteNotFound,
  defaultPendingComponent: RoutePending,
})

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

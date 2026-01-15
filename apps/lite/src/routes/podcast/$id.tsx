// src/routes/podcast/$id.tsx
// Layout route for podcast pages - just renders child routes

import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/podcast/$id')({
  component: () => <Outlet />,
})

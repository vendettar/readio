import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/$country/podcast/$id')({
  component: () => <Outlet />,
})

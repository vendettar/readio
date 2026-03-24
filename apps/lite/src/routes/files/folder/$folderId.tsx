import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/files/folder/$folderId')({
  component: lazyRouteComponent(() => import('../../../routeComponents/files/FilesFolderPage')),
})

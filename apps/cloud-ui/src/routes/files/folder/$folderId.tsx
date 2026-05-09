import { createFileRoute, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { FilesRepository } from '../../../lib/repositories/FilesRepository'

export const Route = createFileRoute('/files/folder/$folderId')({
  beforeLoad: ({ params }) => {
    if (!params.folderId || params.folderId.trim().length === 0) {
      throw redirect({ to: '/files', replace: true })
    }
  },
  loader: async ({ params }) => {
    const folder = await FilesRepository.getFolder(params.folderId)
    if (!folder) {
      throw redirect({ to: '/files', replace: true })
    }
    return { folder }
  },
  component: lazyRouteComponent(() => import('../../../routeComponents/files/FilesFolderPage')),
})

import type { FileFolder, FileSubtitle, FileTrack } from './dexieDb'
import { FilesRepository } from './repositories/FilesRepository'

export interface FilesDataSnapshot {
  folders: FileFolder[]
  tracks: FileTrack[]
  subtitles: FileSubtitle[]
  currentFolder: FileFolder | undefined
  folderCounts: Record<string, number>
}

export async function loadFilesDataSnapshot(folderId: string | null): Promise<FilesDataSnapshot> {
  const folders = await FilesRepository.getAllFolders()
  const tracks = await FilesRepository.getFileTracksInFolder(folderId)

  const [subtitlesByTrack, currentFolder, folderCounts] = await Promise.all([
    Promise.all(tracks.map((track) => FilesRepository.getFileSubtitlesForTrack(track.id))),
    folderId !== null ? FilesRepository.getFolder(folderId) : Promise.resolve(undefined),
    folderId === null && folders.length > 0
      ? Promise.all(
          folders.map(async (folder) => [
            folder.id,
            await FilesRepository.getFileTracksCountInFolder(folder.id),
          ])
        ).then((entries) => Object.fromEntries(entries))
      : Promise.resolve({} as Record<string, number>),
  ])

  return {
    folders,
    tracks,
    subtitles: subtitlesByTrack.flat(),
    currentFolder,
    folderCounts,
  }
}

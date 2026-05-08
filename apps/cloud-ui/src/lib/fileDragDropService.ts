import { resolveDuplicateName } from './files/ingest'
import { FilesRepository } from './repositories/FilesRepository'

export interface MoveTrackToFolderResult {
  finalName: string
  renamed: boolean
}

export async function moveTrackToFolder(
  trackId: string,
  targetFolderId: string | null,
  currentName: string
): Promise<MoveTrackToFolderResult> {
  const existingTracks = await FilesRepository.getFileTracksInFolder(targetFolderId)
  const existingNames = existingTracks.map((track) => track.name)
  const finalName = resolveDuplicateName(currentName, existingNames)

  await FilesRepository.updateFileTrack(trackId, {
    folderId: targetFolderId,
    name: finalName,
  })

  return {
    finalName,
    renamed: finalName !== currentName,
  }
}

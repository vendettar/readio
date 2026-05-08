import type { PodcastDownload } from './dexieDb'
import { emitDownloadChange } from './downloadLibraryEvents'
import { log, error as logError } from './logger'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { FilesRepository } from './repositories/FilesRepository'
import { PlaybackRepository } from './repositories/PlaybackRepository'

export async function getAllDownloadedTracks(): Promise<PodcastDownload[]> {
  return DownloadsRepository.getAllTracks()
}

export async function removeDownloadedTrack(
  trackId: string,
  options: { suppressNotify?: boolean } = {}
): Promise<boolean> {
  const deleted = await DownloadsRepository.removeTrack(trackId)
  if (deleted && !options.suppressNotify) {
    emitDownloadChange()
  }
  return deleted
}

export async function clearAllDownloads(): Promise<number> {
  const downloadedTracks = await getAllDownloadedTracks()
  if (downloadedTracks.length === 0) return 0

  let removedCount = 0

  for (const track of downloadedTracks) {
    const success = await DownloadsRepository.removeTrack(track.id)
    if (success) {
      removedCount += 1
    }
  }

  if (removedCount > 0) {
    emitDownloadChange()
  }

  return removedCount
}

export async function sweepOrphanedBlobs(): Promise<number> {
  try {
    const referencedIds = new Set<string>()

    await FilesRepository.iterateAllTracks((track) => {
      if (track.audioId) referencedIds.add(track.audioId)
      if (track.artworkId) referencedIds.add(track.artworkId)
    })

    await PlaybackRepository.iterateAllPlaybackSessions((session) => {
      if (session.audioId) referencedIds.add(session.audioId)
    })

    const allBlobIds = await PlaybackRepository.getAllAudioBlobIds()
    const orphanIds = allBlobIds.filter((id) => !referencedIds.has(id))

    if (orphanIds.length > 0) {
      const sweepChunkSize = 50
      for (let i = 0; i < orphanIds.length; i += sweepChunkSize) {
        const chunk = orphanIds.slice(i, i + sweepChunkSize)
        await PlaybackRepository.deleteAudioBlobsBulk(chunk)
      }
      log(
        `[download] Swept ${orphanIds.length} orphaned blobs in ${Math.ceil(
          orphanIds.length / sweepChunkSize
        )} batches`
      )
    }

    return orphanIds.length
  } catch (err) {
    logError('[download] Orphan sweep failed:', err)
    return 0
  }
}

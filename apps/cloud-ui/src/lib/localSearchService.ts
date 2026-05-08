import type { Favorite, FileTrack, PlaybackSession, PodcastDownload } from './dexieDb'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { FilesRepository } from './repositories/FilesRepository'
import { PlaybackRepository } from './repositories/PlaybackRepository'

export interface LocalSearchDbSnapshot {
  sessions: PlaybackSession[]
  tracks: Array<{ track: FileTrack; artworkBlob?: Blob }>
  downloads: Array<{ download: PodcastDownload; artworkBlob?: Blob }>
}

async function resolveArtworkBlob(artworkId: string | null | undefined): Promise<Blob | undefined> {
  if (!artworkId) return undefined
  try {
    const blob = await FilesRepository.getAudioBlob(artworkId)
    return blob?.blob
  } catch {
    return undefined
  }
}

export async function loadLocalSearchDbSnapshot(input: {
  query: string
  historyFetchLimit: number
  fileFetchLimit: number
  favoriteCanonicalIdentities: Array<Pick<Favorite, 'podcastItunesId' | 'episodeGuid'>>
}): Promise<LocalSearchDbSnapshot> {
  const [titleSessions, tracks, downloads, favoriteLinkedSessions] = await Promise.all([
    PlaybackRepository.searchPlaybackSessionsByTitle(input.query, input.historyFetchLimit),
    FilesRepository.searchFileTracksByName(input.query, input.fileFetchLimit),
    DownloadsRepository.searchPodcastDownloadsByName(input.query, input.fileFetchLimit),
    input.favoriteCanonicalIdentities.length > 0
      ? PlaybackRepository.searchExploreSessionsByCanonicalEpisodes(
          input.favoriteCanonicalIdentities
        )
      : Promise.resolve([] as PlaybackSession[]),
  ])

  const sessionMap = new Map<string, PlaybackSession>()
  for (const session of titleSessions) {
    sessionMap.set(session.id, session)
  }
  for (const session of favoriteLinkedSessions) {
    sessionMap.set(session.id, session)
  }

  const [tracksWithArtwork, downloadsWithArtwork] = await Promise.all([
    Promise.all(
      tracks.map(async (track) => ({
        track,
        artworkBlob: await resolveArtworkBlob(track.artworkId),
      }))
    ),
    Promise.all(
      downloads.map(async (download) => ({
        download,
        artworkBlob: await resolveArtworkBlob(download.artworkId),
      }))
    ),
  ])

  return {
    sessions: Array.from(sessionMap.values()),
    tracks: tracksWithArtwork,
    downloads: downloadsWithArtwork,
  }
}

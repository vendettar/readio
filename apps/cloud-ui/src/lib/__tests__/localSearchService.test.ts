import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileTrack, PlaybackSession, PodcastDownload } from '../dexieDb'
import { TRACK_SOURCE } from '../db/types'
import { loadLocalSearchDbSnapshot } from '../localSearchService'
import { DownloadsRepository } from '../repositories/DownloadsRepository'
import { FilesRepository } from '../repositories/FilesRepository'
import { PlaybackRepository } from '../repositories/PlaybackRepository'

vi.mock('../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    searchPlaybackSessionsByTitle: vi.fn(),
    searchExploreSessionsByCanonicalEpisodes: vi.fn(),
  },
}))

vi.mock('../repositories/FilesRepository', () => ({
  FilesRepository: {
    searchFileTracksByName: vi.fn(),
    getAudioBlob: vi.fn(),
  },
}))

vi.mock('../repositories/DownloadsRepository', () => ({
  DownloadsRepository: {
    searchPodcastDownloadsByName: vi.fn(),
  },
}))

function makeSession(id: string): PlaybackSession {
  return {
    id,
    source: 'explore',
    title: `Episode ${id}`,
    createdAt: 1,
    lastPlayedAt: 1,
    sizeBytes: 0,
    durationSeconds: 120,
    audioId: null,
    subtitleId: null,
    hasAudioBlob: false,
    progress: 0,
    audioFilename: '',
    subtitleFilename: '',
    audioUrl: `https://example.com/${id}.mp3`,
    artworkUrl: `https://example.com/${id}.jpg`,
    showTitle: 'Podcast',
    episodeGuid: id,
    podcastItunesId: 'pod-1',
    countryAtSave: 'us',
  }
}

function makeTrack(): FileTrack {
  return {
    id: 'track-1',
    folderId: null,
    name: 'Track 1',
    audioId: 'audio-1',
    artworkId: 'art-1',
    sizeBytes: 123,
    durationSeconds: 120,
    createdAt: 1,
    sourceType: TRACK_SOURCE.USER_UPLOAD,
  }
}

function makeDownload(): PodcastDownload {
  return {
    id: 'download-1',
    name: 'Download 1',
    audioId: 'audio-2',
    artworkId: 'art-2',
    sizeBytes: 456,
    durationSeconds: 180,
    createdAt: 1,
    sourceUrlNormalized: 'https://example.com/download-1.mp3',
    downloadedAt: 1,
    countryAtSave: 'us',
    sourcePodcastItunesId: 'pod-1',
    sourceEpisodeGuid: 'ep-1',
    sourcePodcastTitle: 'Podcast',
    sourceEpisodeTitle: 'Episode',
    sourceDescription: 'desc',
    sourceArtworkUrl: 'https://example.com/ep.jpg',
    sourceType: TRACK_SOURCE.PODCAST_DOWNLOAD,
  }
}

describe('localSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges title sessions with favorite-linked sessions and resolves artwork blobs', async () => {
    vi.mocked(PlaybackRepository.searchPlaybackSessionsByTitle).mockResolvedValue([
      makeSession('session-1'),
    ])
    vi.mocked(PlaybackRepository.searchExploreSessionsByCanonicalEpisodes).mockResolvedValue([
      makeSession('session-1'),
      makeSession('session-2'),
    ])
    vi.mocked(FilesRepository.searchFileTracksByName).mockResolvedValue([makeTrack()])
    vi.mocked(DownloadsRepository.searchPodcastDownloadsByName).mockResolvedValue([makeDownload()])
    vi.mocked(FilesRepository.getAudioBlob)
      .mockResolvedValueOnce({
        id: 'art-1',
        blob: new Blob(['track-art']),
        filename: 'track-art.png',
        size: 9,
        type: 'image/png',
        storedAt: 1,
      })
      .mockResolvedValueOnce(undefined)

    const snapshot = await loadLocalSearchDbSnapshot({
      query: 'episode',
      historyFetchLimit: 10,
      fileFetchLimit: 10,
      favoriteCanonicalIdentities: [{ podcastItunesId: 'pod-1', episodeGuid: 'ep-1' }],
    })

    expect(snapshot.sessions.map((session) => session.id)).toEqual(['session-1', 'session-2'])
    expect(snapshot.tracks[0]).toEqual(
      expect.objectContaining({
        track: expect.objectContaining({ id: 'track-1' }),
        artworkBlob: expect.any(Blob),
      })
    )
    expect(snapshot.downloads[0]).toEqual(
      expect.objectContaining({
        download: expect.objectContaining({ id: 'download-1' }),
        artworkBlob: undefined,
      })
    )
  })
})

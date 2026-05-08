import { describe, expect, it } from 'vitest'
import { ROOT_FOLDER_ID, TRACK_SOURCE } from '../db/types'
import { isTrackFolderOrphaned, verifyVaultIntegrity } from '../integrity'
import type { VaultData } from '../vault'

describe('Integrity Verification', () => {
  describe('isTrackFolderOrphaned', () => {
    it('treats root-folder sentinel as non-orphaned', () => {
      const result = isTrackFolderOrphaned(ROOT_FOLDER_ID, new Set(['folder-1']))
      expect(result).toBe(false)
    })
  })

  describe('verifyVaultIntegrity', () => {
    const validVault: VaultData = {
      version: 1,
      exportedAt: Date.now(),
      data: {
        folders: [{ id: 'folder-1', name: 'My Folder', createdAt: Date.now() }],
        tracks: [
          {
            id: 'track-1',
            folderId: 'folder-1',
            name: 'Track 1',
            audioId: 'audio-1',
            sizeBytes: 1000,
            createdAt: Date.now(),
            sourceType: TRACK_SOURCE.USER_UPLOAD,
          },
        ],
        local_subtitles: [
          {
            id: 'sub-1',
            trackId: 'track-1',
            name: 'Sub 1',
            subtitleId: 's-1',
            createdAt: Date.now(),
          },
        ],
        subscriptions: [
          {
            id: 'sub-id-1',
            podcastItunesId: 'pod-1',
            title: 'Podcast',
            author: 'Author',
            artworkUrl: '',
            addedAt: Date.now(),
            countryAtSave: 'us',
          },
        ],
        favorites: [
          {
            id: 'fav-1',
            key: 'pod-1::episode-guid-1',
            audioUrl: 'a-1',
            episodeTitle: 'E1',
            podcastTitle: 'P1',
            artworkUrl: '',
            episodeArtworkUrl: '',
            description: 'Test',
            pubDate: '2025-02-01',
            durationSeconds: 180,
            podcastItunesId: 'pod-1',
            episodeGuid: 'episode-guid-1',
            countryAtSave: 'us',
            addedAt: Date.now(),
          },
        ],
        playback_sessions: [
          {
            id: 'session-1',
            source: 'local',
            title: 'S1',
            createdAt: Date.now(),
            lastPlayedAt: Date.now(),
            sizeBytes: 0,
            durationSeconds: 0,
            audioId: null,
            subtitleId: null,
            hasAudioBlob: false,
            progress: 0,
            audioFilename: '',
            subtitleFilename: '',
            localTrackId: 'track-1',
          },
        ],
        settings: [],
      },
    }

    it('should validate a correct vault', () => {
      const result = verifyVaultIntegrity(validVault)
      expect(result.isValid).toBe(true)
    })

    it('should fail on duplicate IDs', () => {
      const invalidVault = JSON.parse(JSON.stringify(validVault))
      invalidVault.data.folders.push({ id: 'track-1', name: 'Conflict', createdAt: Date.now() })
      const result = verifyVaultIntegrity(invalidVault)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Duplicate ID detected')
    })

    it('should fail on dangling subtitle reference', () => {
      const invalidVault = JSON.parse(JSON.stringify(validVault))
      invalidVault.data.local_subtitles[0].trackId = 'non-existent'
      const result = verifyVaultIntegrity(invalidVault)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Dangling subtitle reference')
    })

    it('should fail on dangling track reference', () => {
      const invalidVault = JSON.parse(JSON.stringify(validVault))
      invalidVault.data.tracks[0].folderId = 'non-existent'
      const result = verifyVaultIntegrity(invalidVault)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Dangling track reference')
    })

    it('should fail on future timestamps', () => {
      const invalidVault = JSON.parse(JSON.stringify(validVault))
      invalidVault.data.folders[0].createdAt = Date.now() + 1000000000
      const result = verifyVaultIntegrity(invalidVault)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Future timestamp detected')
    })

    it('should fail on duplicate subscription podcastItunesId values', () => {
      const invalidVault = JSON.parse(JSON.stringify(validVault))
      invalidVault.data.subscriptions.push({
        ...invalidVault.data.subscriptions[0],
        id: 'new-id',
      })
      const result = verifyVaultIntegrity(invalidVault)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Duplicate subscription podcastItunesId')
    })

    it('should fail on duplicate subscription podcastItunesId values after canonical trimming', () => {
      const invalidVault = JSON.parse(JSON.stringify(validVault))
      invalidVault.data.subscriptions.push({
        ...invalidVault.data.subscriptions[0],
        id: 'new-id',
        podcastItunesId: ` ${invalidVault.data.subscriptions[0].podcastItunesId} `,
      })
      const result = verifyVaultIntegrity(invalidVault)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Duplicate subscription podcastItunesId')
    })

    it('fails on duplicate podcast downloads with the same canonical episode even when source URLs differ', () => {
      const vaultWithRotatedDownloadUrls = JSON.parse(JSON.stringify(validVault))
      vaultWithRotatedDownloadUrls.data.tracks.push(
        {
          id: 'download-1',
          name: 'Episode Download A',
          audioId: 'audio-download-1',
          sizeBytes: 100,
          createdAt: Date.now(),
          sourceType: TRACK_SOURCE.PODCAST_DOWNLOAD,
          sourceUrlNormalized: 'https://cdn-a.example.com/episode.mp3',
          sourcePodcastTitle: 'Podcast',
          sourceEpisodeTitle: 'Episode',
          sourceDescription: '',
          sourceArtworkUrl: 'https://example.com/art.jpg',
          downloadedAt: Date.now(),
          countryAtSave: 'us',
          sourcePodcastItunesId: 'pod-1',
          sourceEpisodeGuid: 'episode-guid-1',
        },
        {
          id: 'download-2',
          name: 'Episode Download B',
          audioId: 'audio-download-2',
          sizeBytes: 100,
          createdAt: Date.now(),
          sourceType: TRACK_SOURCE.PODCAST_DOWNLOAD,
          sourceUrlNormalized: 'https://cdn-b.example.com/episode.mp3',
          sourcePodcastTitle: 'Podcast',
          sourceEpisodeTitle: 'Episode',
          sourceDescription: '',
          sourceArtworkUrl: 'https://example.com/art.jpg',
          downloadedAt: Date.now(),
          countryAtSave: 'us',
          sourcePodcastItunesId: 'pod-1',
          sourceEpisodeGuid: 'episode-guid-1',
        }
      )

      const result = verifyVaultIntegrity(vaultWithRotatedDownloadUrls)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Duplicate podcast download: pod-1:episode-guid-1')
    })

    it('fails on duplicate remote sessions with the same canonical episode even when audio URLs differ', () => {
      const vaultWithDuplicateRemoteSessions = JSON.parse(JSON.stringify(validVault))
      vaultWithDuplicateRemoteSessions.data.playback_sessions.push(
        {
          id: 'session-remote-1',
          source: 'explore',
          title: 'Remote Session A',
          createdAt: Date.now(),
          lastPlayedAt: Date.now(),
          sizeBytes: 0,
          durationSeconds: 100,
          audioId: null,
          subtitleId: null,
          hasAudioBlob: false,
          progress: 0,
          audioFilename: '',
          subtitleFilename: '',
          audioUrl: 'https://cdn-a.example.com/episode.mp3',
          artworkUrl: 'https://example.com/art.jpg',
          podcastTitle: 'Podcast',
          publishedAt: Date.now(),
          episodeGuid: 'episode-guid-1',
          podcastItunesId: 'pod-1',
          countryAtSave: 'us',
        },
        {
          id: 'session-remote-2',
          source: 'explore',
          title: 'Remote Session B',
          createdAt: Date.now(),
          lastPlayedAt: Date.now(),
          sizeBytes: 0,
          durationSeconds: 100,
          audioId: null,
          subtitleId: null,
          hasAudioBlob: false,
          progress: 0,
          audioFilename: '',
          subtitleFilename: '',
          audioUrl: 'https://cdn-b.example.com/episode.mp3',
          artworkUrl: 'https://example.com/art.jpg',
          podcastTitle: 'Podcast',
          publishedAt: Date.now(),
          episodeGuid: 'episode-guid-1',
          podcastItunesId: 'pod-1',
          countryAtSave: 'us',
        }
      )

      const result = verifyVaultIntegrity(vaultWithDuplicateRemoteSessions)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Duplicate remote session: pod-1:episode-guid-1')
    })
  })
})

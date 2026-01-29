import { describe, expect, it } from 'vitest'
import { verifyOpmlIntegrity, verifyVaultIntegrity } from '../integrity'
import type { VaultData } from '../vault'

describe('Integrity Verification', () => {
  describe('verifyVaultIntegrity', () => {
    const validVault: VaultData = {
      version: 1,
      exportedAt: Date.now(),
      data: {
        folders: [{ id: 'folder-1', name: 'My Folder', createdAt: Date.now() }],
        local_tracks: [
          {
            id: 'track-1',
            folderId: 'folder-1',
            name: 'Track 1',
            audioId: 'audio-1',
            sizeBytes: 1000,
            createdAt: Date.now(),
          },
        ],
        local_subtitles: [{ id: 'sub-1', trackId: 'track-1', name: 'Sub 1', subtitleId: 's-1' }],
        subscriptions: [
          {
            id: 'sub-id-1',
            feedUrl: 'http://example.com/feed.xml',
            title: 'Podcast',
            author: 'Author',
            artworkUrl: '',
            addedAt: Date.now(),
          },
        ],
        favorites: [
          {
            id: 'fav-1',
            key: 'key-1',
            feedUrl: 'url-1',
            audioUrl: 'a-1',
            episodeTitle: 'E1',
            podcastTitle: 'P1',
            artworkUrl: '',
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
            duration: 0,
            audioId: null,
            subtitleId: null,
            hasAudioBlob: false,
            subtitleType: null,
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
      invalidVault.data.local_tracks[0].folderId = 'non-existent'
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

    it('should fail on duplicate feedUrls', () => {
      const invalidVault = JSON.parse(JSON.stringify(validVault))
      invalidVault.data.subscriptions.push({
        ...invalidVault.data.subscriptions[0],
        id: 'new-id',
      })
      const result = verifyVaultIntegrity(invalidVault)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Duplicate subscription feedUrl')
    })
  })

  describe('verifyOpmlIntegrity', () => {
    it('should validate unique subscriptions', () => {
      const items = [
        { title: 'P1', xmlUrl: 'http://p1.com' },
        { title: 'P2', xmlUrl: 'http://p2.com' },
      ]
      const result = verifyOpmlIntegrity(items)
      expect(result.isValid).toBe(true)
    })

    it('should fail on duplicate xmlUrls', () => {
      const items = [
        { title: 'P1', xmlUrl: 'http://p1.com' },
        { title: 'P2', xmlUrl: 'http://p1.com' },
      ]
      const result = verifyOpmlIntegrity(items)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Duplicate OPML feedUrl')
    })
  })
})

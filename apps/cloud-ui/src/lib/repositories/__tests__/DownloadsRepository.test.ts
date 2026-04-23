import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackSession } from '../../db/types'
import { DB, db } from '../../dexieDb'
import {
  DownloadsRepository,
  IMPORT_SUBTITLE_REASON,
  subscribeToDownloadSubtitles,
  UPSERT_ASR_SUBTITLE_REASON,
} from '../DownloadsRepository'

async function extractZipEntryNames(blob: Blob): Promise<string[]> {
  const bytes = await blobToBytes(blob)
  const raw = new TextDecoder('latin1').decode(bytes)
  const matches =
    raw.match(/[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+\.\d{4}-\d{2}-\d{2}(?:-\d+)?\.srt/gi) ?? []

  return Array.from(new Set(matches))
}

async function zipContainsEntry(blob: Blob, filename: string): Promise<boolean> {
  const raw = await blobToRawText(blob)
  return raw.includes(filename)
}

async function blobToRawText(blob: Blob): Promise<string> {
  const bytes = await blobToBytes(blob)
  return new TextDecoder('latin1').decode(bytes)
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }

  if (typeof FileReader === 'undefined') {
    throw new Error('Blob reader is unavailable in this test environment')
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read zip blob'))
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result))
        return
      }
      reject(new Error('Expected ArrayBuffer result when reading zip blob'))
    }
    reader.readAsArrayBuffer(blob)
  })
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUtf8ZipGeneralPurposeFlags(
  bytes: Uint8Array,
  filename: string
): { local: number; central: number } | null {
  const targetNameBytes = new TextEncoder().encode(filename)
  let localFlag: number | null = null
  let centralFlag: number | null = null

  for (let offset = 0; offset <= bytes.length - 30; offset += 1) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x03 ||
      bytes[offset + 3] !== 0x04
    ) {
      continue
    }
    const nameLength = readUint16LE(bytes, offset + 26)
    const nameStart = offset + 30
    const nameEnd = nameStart + nameLength
    if (nameEnd > bytes.length) continue
    const nameBytes = bytes.slice(nameStart, nameEnd)
    if (bytesEqual(nameBytes, targetNameBytes)) {
      localFlag = readUint16LE(bytes, offset + 6)
      break
    }
  }

  for (let offset = 0; offset <= bytes.length - 46; offset += 1) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x01 ||
      bytes[offset + 3] !== 0x02
    ) {
      continue
    }
    const nameLength = readUint16LE(bytes, offset + 28)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > bytes.length) continue
    const nameBytes = bytes.slice(nameStart, nameEnd)
    if (bytesEqual(nameBytes, targetNameBytes)) {
      centralFlag = readUint16LE(bytes, offset + 8)
      break
    }
  }

  if (localFlag === null || centralFlag === null) {
    return null
  }
  return { local: localFlag, central: centralFlag }
}

describe('DownloadsRepository', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  async function createDownloadWithSubtitles(
    subtitleCount: number,
    opts: { activeId?: string } = {}
  ) {
    const trackId = await DB.addPodcastDownload({
      name: 'Test Episode',
      audioId: 'audio-1',
      sourceUrlNormalized: 'https://example.com/ep.mp3',
      downloadedAt: Date.now(),
      sizeBytes: 1024,
      countryAtSave: 'US',
    })

    const subtitleIds: string[] = []
    for (let i = 0; i < subtitleCount; i++) {
      const subtitleId = await DB.addSubtitle(
        [{ start: i, end: i + 1, text: `sub content ${i}` }],
        `sub-${i}.srt`
      )
      const now = Date.now() + i * 1000 // Ensure ordering
      await db.local_subtitles.add({
        id: `file-sub-${i}`,
        trackId,
        subtitleId,
        name: `Sub ${i}`,
        sourceKind: 'asr_online',
        provider: 'groq',
        model: 'whisper',
        language: 'en',
        createdAt: now,
        status: 'ready',
      })
      subtitleIds.push(`file-sub-${i}`)
    }

    if (opts.activeId) {
      await db.tracks.update(trackId, { activeSubtitleId: opts.activeId })
    }

    return { trackId, subtitleIds }
  }

  describe('getRestoreSessionByTrackId', () => {
    it('returns primary local-track session when it exists', async () => {
      const playbackSession = { id: 'local-track-track-1' } as PlaybackSession
      const getPlaybackSessionSpy = vi
        .spyOn(DB, 'getPlaybackSession')
        .mockResolvedValue(playbackSession as import('../../dexieDb').PlaybackSession)
      const findLastSessionSpy = vi
        .spyOn(DB, 'findLastSessionByTrackId')
        .mockResolvedValue(undefined)

      const result = await DownloadsRepository.getRestoreSessionByTrackId('track-1')

      expect(getPlaybackSessionSpy).toHaveBeenCalledWith('local-track-track-1')
      expect(findLastSessionSpy).not.toHaveBeenCalled()
      expect(result).toBe(playbackSession)

      getPlaybackSessionSpy.mockRestore()
      findLastSessionSpy.mockRestore()
    })

    it('falls back to last session lookup when primary local-track session is missing', async () => {
      const fallbackSession = { id: 'history-session-2' } as PlaybackSession
      const getPlaybackSessionSpy = vi.spyOn(DB, 'getPlaybackSession').mockResolvedValue(undefined)
      const findLastSessionSpy = vi
        .spyOn(DB, 'findLastSessionByTrackId')
        .mockResolvedValue(fallbackSession as import('../../dexieDb').PlaybackSession)

      const result = await DownloadsRepository.getRestoreSessionByTrackId('track-2')

      expect(getPlaybackSessionSpy).toHaveBeenCalledWith('local-track-track-2')
      expect(findLastSessionSpy).toHaveBeenCalledWith('track-2')
      expect(result).toBe(fallbackSession)

      getPlaybackSessionSpy.mockRestore()
      findLastSessionSpy.mockRestore()
    })

    it('returns undefined when neither primary nor fallback session exists', async () => {
      const getPlaybackSessionSpy = vi.spyOn(DB, 'getPlaybackSession').mockResolvedValue(undefined)
      const findLastSessionSpy = vi
        .spyOn(DB, 'findLastSessionByTrackId')
        .mockResolvedValue(undefined)

      const result = await DownloadsRepository.getRestoreSessionByTrackId('track-missing')

      expect(getPlaybackSessionSpy).toHaveBeenCalledWith('local-track-track-missing')
      expect(findLastSessionSpy).toHaveBeenCalledWith('track-missing')
      expect(result).toBeUndefined()

      getPlaybackSessionSpy.mockRestore()
      findLastSessionSpy.mockRestore()
    })
  })

  describe('getSubtitleVersionSummary', () => {
    it('returns zero-count summary for track with no subtitles', async () => {
      const trackId = await DB.addPodcastDownload({
        name: 'Empty',
        audioId: 'a1',
        sourceUrlNormalized: 'https://example.com/1.mp3',
        downloadedAt: Date.now(),
        sizeBytes: 1024,
        countryAtSave: 'US',
      })

      const summary = await DownloadsRepository.getSubtitleVersionSummary(trackId)
      expect(summary.versionCount).toBe(0)
      expect(summary.activeVersion).toBeNull()
      expect(summary.latestSource).toBeNull()
    })

    it('returns count and active version info', async () => {
      const { trackId } = await createDownloadWithSubtitles(3, {
        activeId: 'file-sub-1',
      })

      const summary = await DownloadsRepository.getSubtitleVersionSummary(trackId)
      expect(summary.versionCount).toBe(3)
      expect(summary.activeVersion).toBeDefined()
      expect(summary.activeVersion?.id).toBe('file-sub-1')
      expect(summary.activeVersion?.name).toBe('Sub 1')
    })

    it('returns latest source info sorted by createdAt', async () => {
      const { trackId } = await createDownloadWithSubtitles(2)

      const summary = await DownloadsRepository.getSubtitleVersionSummary(trackId)
      expect(summary.latestSource).toBeDefined()
      expect(summary.latestSource?.provider).toBe('groq')
    })
  })

  describe('getSubtitleVersions', () => {
    it('returns all versions sorted by createdAt DESC', async () => {
      const { trackId } = await createDownloadWithSubtitles(3)

      const versions = await DownloadsRepository.getSubtitleVersions(trackId)
      expect(versions).toHaveLength(3)
      // Most recent first
      expect(versions[0].id).toBe('file-sub-2')
      expect(versions[1].id).toBe('file-sub-1')
      expect(versions[2].id).toBe('file-sub-0')
    })
  })

  describe('setActiveSubtitle', () => {
    it('sets active subtitle on download', async () => {
      const { trackId } = await createDownloadWithSubtitles(2)

      const ok = await DownloadsRepository.setActiveSubtitle(trackId, 'file-sub-0', true)
      expect(ok).toBe(true)

      const download = await db.tracks.get(trackId)
      expect(download?.activeSubtitleId).toBe('file-sub-0')
      expect((download as import('../../dexieDb').PodcastDownload)?.manualPinnedAt).toBeDefined()
    })

    it('does NOT write manualPinnedAt when isManual is false', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)

      await DownloadsRepository.setActiveSubtitle(trackId, 'file-sub-0', false)

      const download = await db.tracks.get(trackId)
      expect(download?.activeSubtitleId).toBe('file-sub-0')
      expect((download as import('../../dexieDb').PodcastDownload)?.manualPinnedAt).toBeUndefined()
    })

    it('rejects non-existent version', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)

      const ok = await DownloadsRepository.setActiveSubtitle(trackId, 'nonexistent', true)
      expect(ok).toBe(false)
    })

    it('rejects failed status version', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)

      // Mark as failed
      await db.local_subtitles.update('file-sub-0', { status: 'failed' })

      const ok = await DownloadsRepository.setActiveSubtitle(trackId, 'file-sub-0', true)
      expect(ok).toBe(false)
    })
  })

  describe('deleteSubtitleVersion', () => {
    it('deletes a non-active version without changing active', async () => {
      const { trackId } = await createDownloadWithSubtitles(2, {
        activeId: 'file-sub-1',
      })

      const ok = await DownloadsRepository.deleteSubtitleVersion(trackId, 'file-sub-0')
      expect(ok).toBe(true)

      const download = await db.tracks.get(trackId)
      expect(download?.activeSubtitleId).toBe('file-sub-1')

      const remaining = await db.local_subtitles.where('trackId').equals(trackId).toArray()
      expect(remaining).toHaveLength(1)
    })

    it('falls back to most recent ready version when active is deleted', async () => {
      const { trackId } = await createDownloadWithSubtitles(3, {
        activeId: 'file-sub-2',
      })

      const ok = await DownloadsRepository.deleteSubtitleVersion(trackId, 'file-sub-2')
      expect(ok).toBe(true)

      const download = await db.tracks.get(trackId)
      // file-sub-1 is the most recent remaining (createdAt basis)
      expect(download?.activeSubtitleId).toBe('file-sub-1')
    })

    it('clears activeSubtitleId when last version is deleted', async () => {
      const { trackId } = await createDownloadWithSubtitles(1, {
        activeId: 'file-sub-0',
      })

      const ok = await DownloadsRepository.deleteSubtitleVersion(trackId, 'file-sub-0')
      expect(ok).toBe(true)

      const download = await db.tracks.get(trackId)
      expect(download?.activeSubtitleId).toBeUndefined()
    })

    it('performs reference-protected deletion of subtitle blob', async () => {
      // Create two downloads sharing the same subtitle blob
      const subtitleId = await DB.addSubtitle(
        [{ start: 0, end: 1, text: 'shared content' }],
        'shared.srt'
      )

      const trackId1 = await DB.addPodcastDownload({
        name: 'Ep 1',
        audioId: 'a1',
        sourceUrlNormalized: 'https://example.com/1.mp3',
        downloadedAt: Date.now(),
        sizeBytes: 1024,
        countryAtSave: 'US',
      })
      const trackId2 = await DB.addPodcastDownload({
        name: 'Ep 2',
        audioId: 'a2',
        sourceUrlNormalized: 'https://example.com/2.mp3',
        downloadedAt: Date.now(),
        sizeBytes: 1024,
        countryAtSave: 'US',
      })

      await db.local_subtitles.add({
        id: 'link-1',
        trackId: trackId1,
        subtitleId,
        name: 'sub.srt',
        status: 'ready',
        createdAt: Date.now(),
      })
      await db.local_subtitles.add({
        id: 'link-2',
        trackId: trackId2,
        subtitleId,
        name: 'sub.srt',
        status: 'ready',
        createdAt: Date.now(),
      })

      // Delete from track 1 — should NOT delete shared subtitle blob
      await DownloadsRepository.deleteSubtitleVersion(trackId1, 'link-1')
      expect(await db.subtitles.get(subtitleId)).toBeDefined()

      // Delete from track 2 — should delete subtitle blob (last ref)
      await DownloadsRepository.deleteSubtitleVersion(trackId2, 'link-2')
      expect(await db.subtitles.get(subtitleId)).toBeUndefined()
    })
  })

  describe('getReadySubtitlesByTrackId', () => {
    it('returns all ready subtitles with active first', async () => {
      const { trackId } = await createDownloadWithSubtitles(2)
      // sub-1 is newer, but we'll set sub-0 as active
      await DownloadsRepository.setActiveSubtitle(trackId, 'file-sub-0', true)

      const results = await DownloadsRepository.getReadySubtitlesByTrackId(trackId)
      expect(results).toHaveLength(2)
      expect(results[0].fileSub.id).toBe('file-sub-0') // Active first
      expect(results[1].fileSub.id).toBe('file-sub-1') // Then newer one
    })

    it('falls back to newest ready when active is missing/not ready', async () => {
      const { trackId } = await createDownloadWithSubtitles(2, { activeId: 'missing' })
      const results = await DownloadsRepository.getReadySubtitlesByTrackId(trackId)
      expect(results).toHaveLength(2)
      expect(results[0].fileSub.id).toBe('file-sub-1') // Newest first
    })
  })

  describe('shouldAutoSetActive (concurrency)', () => {
    it('allows auto-set when no manualPinnedAt', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)

      const ok = await DownloadsRepository.shouldAutoSetActive(trackId, Date.now() - 10000)
      expect(ok).toBe(true)
    })

    it('blocks auto-set when user manually pinned after task started', async () => {
      const { trackId } = await createDownloadWithSubtitles(1, {
        activeId: 'file-sub-0',
      })

      // Simulate user manual pin
      const taskStartedAt = Date.now() - 5000
      await db.tracks.update(trackId, {
        manualPinnedAt: Date.now(),
      } as import('../../db/types').PodcastDownloadTrack)

      const ok = await DownloadsRepository.shouldAutoSetActive(trackId, taskStartedAt)
      expect(ok).toBe(false)
    })

    it('allows auto-set when manualPinnedAt is before task start', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)

      const oldPin = Date.now() - 60000
      await db.tracks.update(trackId, {
        manualPinnedAt: oldPin,
      } as import('../../db/types').PodcastDownloadTrack)

      const ok = await DownloadsRepository.shouldAutoSetActive(trackId, Date.now() - 1000)
      expect(ok).toBe(true)
    })
  })

  describe('exportSubtitleVersion', () => {
    it('exports a single subtitle as SRT blob', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)

      const result = await DownloadsRepository.exportSubtitleVersion(
        trackId,
        'file-sub-0',
        'test-episode'
      )

      expect(result.ok).toBe(true)
      expect(result.filename).toContain('test-episode')
      expect(result.filename).toContain('.srt')
      expect(result.blob).toBeDefined()
      expect(result.blob?.type).toBe('application/x-subrip;charset=utf-8')
      expect(result.blob?.size).toBeGreaterThan(0)
    })

    it('exports a generated subtitle as VTT when explicitly requested', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)
      await db.local_subtitles.update('file-sub-0', {
        provider: 'groq',
        model: 'whisper-large-v3',
        createdAt: Date.UTC(2026, 2, 3, 12, 0, 0),
      })

      const result = await DownloadsRepository.exportSubtitleVersion(
        trackId,
        'file-sub-0',
        'my-episode',
        'vtt'
      )

      expect(result.ok).toBe(true)
      expect(result.filename).toBe('my-episode.groq.whisper-large-v3.2026-03-03.vtt')
      expect(result.blob?.type).toBe('text/vtt;charset=utf-8')
      if (!result.blob) {
        throw new Error('Expected subtitle export blob to be defined')
      }
      const content = await blobToRawText(result.blob)
      expect(content).toContain('WEBVTT')
    })

    it('uses episode.provider.model.yyyy-MM-dd.srt naming contract', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)
      await db.local_subtitles.update('file-sub-0', {
        provider: 'groq',
        model: 'whisper-large-v3',
        createdAt: Date.UTC(2026, 2, 3, 12, 0, 0),
      })

      const result = await DownloadsRepository.exportSubtitleVersion(
        trackId,
        'file-sub-0',
        'my-episode'
      )

      expect(result.ok).toBe(true)
      expect(result.filename).toBe('my-episode.groq.whisper-large-v3.2026-03-03.srt')
    })

    it('uses original filename for manual upload subtitles', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)
      await db.local_subtitles.update('file-sub-0', {
        sourceKind: 'manual_upload',
        name: 'My Imported Subtitle.vtt',
        provider: undefined,
        model: undefined,
      })

      const result = await DownloadsRepository.exportSubtitleVersion(
        trackId,
        'file-sub-0',
        'my-episode'
      )

      expect(result.ok).toBe(true)
      expect(result.filename).toBe('My Imported Subtitle.vtt')
      expect(result.filename).not.toContain('unknown-provider')
      expect(result.filename).not.toContain('unknown-model')
      if (!result.blob) {
        throw new Error('Expected subtitle export blob to be defined')
      }
      const content = await blobToRawText(result.blob)
      expect(content).toContain('WEBVTT')
    })

    it('normalizes manual export extension to match generated content', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)
      await db.local_subtitles.update('file-sub-0', {
        sourceKind: 'manual_upload',
        name: 'My Imported Subtitle.txt',
        provider: undefined,
        model: undefined,
      })

      const result = await DownloadsRepository.exportSubtitleVersion(
        trackId,
        'file-sub-0',
        'my-episode'
      )

      expect(result.ok).toBe(true)
      expect(result.filename).toBe('My Imported Subtitle.srt')
      if (!result.blob) {
        throw new Error('Expected subtitle export blob to be defined')
      }
      const content = await blobToRawText(result.blob)
      expect(content).not.toContain('WEBVTT')
    })
  })

  describe('exportActiveTranscriptVersion', () => {
    it('exports the active ready transcript version for a download', async () => {
      const { trackId } = await createDownloadWithSubtitles(2, {
        activeId: 'file-sub-0',
      })

      const result = await DownloadsRepository.exportActiveTranscriptVersion(trackId, 'episode')

      expect(result.ok).toBe(true)
      expect(result.filename).toContain('episode')
      expect(result.filename).toContain('.srt')
      expect(result.blob).toBeDefined()
      expect(result.blob?.type).toBe('application/x-subrip;charset=utf-8')
    })

    it('exports the newest ready transcript when no active transcript is set', async () => {
      const { trackId } = await createDownloadWithSubtitles(2)

      const result = await DownloadsRepository.exportActiveTranscriptVersion(trackId, 'episode')

      expect(result.ok).toBe(true)
      expect(result.filename).toContain('episode')
      expect(result.blob).toBeDefined()
    })
  })

  describe('exportAudioFile', () => {
    it('exports the audio blob for a download track', async () => {
      const audioId = await DB.addAudioBlob(
        new Blob(['download-audio'], { type: 'audio/mpeg' }),
        'ep.mp3'
      )
      const trackId = await DB.addPodcastDownload({
        name: 'Export Episode',
        audioId,
        sourceUrlNormalized: 'https://example.com/export.mp3',
        downloadedAt: Date.now(),
        sizeBytes: 1024,
        countryAtSave: 'US',
      })

      const result = await DownloadsRepository.exportAudioFile(trackId, 'Export Episode')

      expect(result.ok).toBe(true)
      expect(result.filename).toMatch(/Export Episode|ep/)
      expect(result.blob).toBeDefined()
    })
  })

  describe('importSubtitleVersion', () => {
    it('imports subtitle content as manual ready version', async () => {
      const { trackId } = await createDownloadWithSubtitles(0)
      const content = '1\n00:00:00,000 --> 00:00:01,000\nhello\n'

      const result = await DownloadsRepository.importSubtitleVersion(trackId, {
        filename: 'imported.srt',
        content,
      })

      expect(result.ok).toBe(true)
      expect(result.reason).toBe(IMPORT_SUBTITLE_REASON.IMPORTED)
      expect(result.fileSubtitleId).toBeDefined()
      if (!result.fileSubtitleId) {
        throw new Error('Expected imported subtitle id')
      }
      const imported = await db.local_subtitles.get(result.fileSubtitleId)
      expect(imported?.trackId).toBe(trackId)
      expect(imported?.name).toBe('imported.srt')
      expect(imported?.sourceKind).toBe('manual_upload')
      expect(imported?.status).toBe('ready')
    })

    it('emits a subtitle change event after import succeeds', async () => {
      const { trackId } = await createDownloadWithSubtitles(0)
      const listener = vi.fn()
      const unsubscribe = subscribeToDownloadSubtitles(listener)

      try {
        const result = await DownloadsRepository.importSubtitleVersion(trackId, {
          filename: 'imported.srt',
          content: '1\n00:00:00,000 --> 00:00:01,000\nhello\n',
        })

        expect(result.ok).toBe(true)
        expect(listener).toHaveBeenCalledTimes(1)
      } finally {
        unsubscribe()
      }
    })

    it('suffixes duplicate imported subtitle names deterministically', async () => {
      const { trackId } = await createDownloadWithSubtitles(0)
      const content = '1\n00:00:00,000 --> 00:00:01,000\nhello\n'

      const first = await DownloadsRepository.importSubtitleVersion(trackId, {
        filename: 'imported.srt',
        content,
      })
      const second = await DownloadsRepository.importSubtitleVersion(trackId, {
        filename: 'imported.srt',
        content,
      })

      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
      if (!first.fileSubtitleId || !second.fileSubtitleId) {
        throw new Error('Expected imported subtitle ids')
      }
      const firstSub = await db.local_subtitles.get(first.fileSubtitleId)
      const secondSub = await db.local_subtitles.get(second.fileSubtitleId)
      expect(firstSub?.name).toBe('imported.srt')
      expect(secondSub?.name).toBe('imported (2).srt')
    })
  })

  describe('upsertAsrSubtitleVersion', () => {
    it('replaces existing ASR subtitle when provider+model matches', async () => {
      const { trackId } = await createDownloadWithSubtitles(2, { activeId: 'file-sub-1' })
      const beforeMatched = await db.local_subtitles.get('file-sub-1')
      if (!beforeMatched) {
        throw new Error('Expected existing subtitle version')
      }
      const oldSubtitleId = beforeMatched.subtitleId

      const result = await DownloadsRepository.upsertAsrSubtitleVersion({
        trackId,
        cues: [{ start: 0, end: 1, text: 'fresh transcript' }],
        subtitleName: 'Episode - groq - whisper',
        subtitleFilename: 'Episode.groq.whisper.srt',
        provider: 'groq',
        model: 'whisper',
      })

      expect(result.ok).toBe(true)
      expect(result.reason).toBe(UPSERT_ASR_SUBTITLE_REASON.REPLACED)
      expect(result.fileSubtitleId).toBe('file-sub-1')

      const afterVersions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
      expect(afterVersions).toHaveLength(2)

      const replaced = await db.local_subtitles.get('file-sub-1')
      expect(replaced?.name).toBe('Episode - groq - whisper')
      expect(replaced?.provider).toBe('groq')
      expect(replaced?.model).toBe('whisper')
      expect(replaced?.subtitleId).not.toBe(oldSubtitleId)

      const oldSubtitle = await db.subtitles.get(oldSubtitleId)
      expect(oldSubtitle).toBeUndefined()

      const track = await db.tracks.get(trackId)
      expect(track?.activeSubtitleId).toBe('file-sub-1')
      expect((track as import('../../db/types').PodcastDownloadTrack)?.manualPinnedAt).toBeDefined()
    })

    it('creates a new ASR subtitle when provider differs even if model is same', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)
      const beforeVersions = await db.local_subtitles.where('trackId').equals(trackId).toArray()

      const result = await DownloadsRepository.upsertAsrSubtitleVersion({
        trackId,
        cues: [{ start: 0, end: 1, text: 'new provider transcript' }],
        subtitleName: 'Episode - qwen - whisper',
        subtitleFilename: 'Episode.qwen.whisper.srt',
        provider: 'qwen',
        model: 'whisper',
      })

      expect(result.ok).toBe(true)
      expect(result.reason).toBe(UPSERT_ASR_SUBTITLE_REASON.CREATED)
      expect(result.fileSubtitleId).toBeDefined()

      const afterVersions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
      expect(afterVersions).toHaveLength(beforeVersions.length + 1)
      expect(
        afterVersions.some((version) => version.provider === 'groq' && version.model === 'whisper')
      ).toBe(true)
      expect(
        afterVersions.some((version) => version.provider === 'qwen' && version.model === 'whisper')
      ).toBe(true)

      const track = await db.tracks.get(trackId)
      expect(track?.activeSubtitleId).toBe(result.fileSubtitleId)
    })
  })

  describe('removeTrack', () => {
    it('clears local session audio references before blob cleanup', async () => {
      const audioId = await DB.addAudioBlob(new Blob(['audio']), 'episode.mp3')
      const trackId = await DB.addPodcastDownload({
        name: 'Ep remove test',
        audioId,
        sourceUrlNormalized: 'https://example.com/remove.mp3',
        downloadedAt: Date.now(),
        sizeBytes: 1024,
        countryAtSave: 'US',
      })

      await DB.createPlaybackSession({
        id: 'session-local-track',
        source: 'local',
        title: 'Ep remove test',
        audioId,
        hasAudioBlob: true,
        localTrackId: trackId,
      })

      const removed = await DownloadsRepository.removeTrack(trackId)
      expect(removed).toBe(true)

      const removedTrack = await db.tracks.get(trackId)
      expect(removedTrack).toBeUndefined()

      const session = await db.playback_sessions.get('session-local-track')
      expect(session?.localTrackId).toBeNull()
      expect(session?.audioId).toBeNull()
      expect(session?.hasAudioBlob).toBe(false)

      const remainingBlob = await db.audioBlobs.get(audioId)
      expect(remainingBlob).toBeUndefined()
    })

    it('clears stale local session audio references without localTrackId to prevent blob pinning', async () => {
      const audioId = await DB.addAudioBlob(new Blob(['audio']), 'episode.mp3')
      const trackId = await DB.addPodcastDownload({
        name: 'Ep stale session',
        audioId,
        sourceUrlNormalized: 'https://example.com/stale.mp3',
        downloadedAt: Date.now(),
        sizeBytes: 1024,
        countryAtSave: 'US',
      })

      await DB.createPlaybackSession({
        id: 'session-stale-local',
        source: 'local',
        title: 'Ep stale session',
        audioId,
        hasAudioBlob: true,
        localTrackId: null,
      })

      const removed = await DownloadsRepository.removeTrack(trackId)
      expect(removed).toBe(true)

      const session = await db.playback_sessions.get('session-stale-local')
      expect(session?.localTrackId).toBeNull()
      expect(session?.audioId).toBeNull()
      expect(session?.hasAudioBlob).toBe(false)

      const remainingBlob = await db.audioBlobs.get(audioId)
      expect(remainingBlob).toBeUndefined()
    })

    it('returns false when cleanup throws asynchronously', async () => {
      const removeSpy = vi
        .spyOn(DB, 'removePodcastDownloadWithCleanup')
        .mockRejectedValueOnce(new Error('cleanup failed'))

      try {
        const removed = await DownloadsRepository.removeTrack('track-throw')
        expect(removed).toBe(false)
      } finally {
        removeSpy.mockRestore()
      }
    })
  })

  describe('exportAllSubtitleVersions', () => {
    it('exports single version as zip', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)

      const result = await DownloadsRepository.exportAllSubtitleVersions(trackId, 'test-episode')

      expect(result.ok).toBe(true)
      expect(result.filename).toContain('.zip')
      expect(result.blob).toBeDefined()
      expect(result.blob?.type).toBe('application/zip')
    })

    it('exports multiple versions as zip', async () => {
      const { trackId } = await createDownloadWithSubtitles(3)

      const result = await DownloadsRepository.exportAllSubtitleVersions(trackId, 'test-episode')

      expect(result.ok).toBe(true)
      expect(result.filename).toContain('.zip')
      expect(result.blob).toBeDefined()
      expect(result.blob?.type).toBe('application/zip')
      expect(result.blob?.size).toBeGreaterThan(0)
    })

    it('uniquifies duplicate subtitle filenames deterministically in export-all zip', async () => {
      const { trackId } = await createDownloadWithSubtitles(3)
      const sameDay = Date.UTC(2026, 2, 3, 12, 0, 0)

      await db.local_subtitles.update('file-sub-0', {
        provider: 'groq',
        model: 'whisper-large-v3',
        createdAt: sameDay,
      })
      await db.local_subtitles.update('file-sub-1', {
        provider: 'groq',
        model: 'whisper-large-v3',
        createdAt: sameDay + 1,
      })
      await db.local_subtitles.update('file-sub-2', {
        provider: 'groq',
        model: 'whisper-large-v3',
        createdAt: sameDay + 2,
      })

      const result = await DownloadsRepository.exportAllSubtitleVersions(trackId, 'my-episode')

      expect(result.ok).toBe(true)
      expect(result.blob).toBeDefined()
      if (!result.blob) {
        throw new Error('Expected export-all zip blob to be defined')
      }
      const names = await extractZipEntryNames(result.blob)
      expect(names).toEqual([
        'my-episode.groq.whisper-large-v3.2026-03-03.srt',
        'my-episode.groq.whisper-large-v3.2026-03-03-2.srt',
        'my-episode.groq.whisper-large-v3.2026-03-03-3.srt',
      ])
    })

    it('uniquifies export-all filenames case-insensitively for manual uploads', async () => {
      const { trackId } = await createDownloadWithSubtitles(2)
      await db.local_subtitles.update('file-sub-0', {
        sourceKind: 'manual_upload',
        name: 'CaseTitle.srt',
        provider: undefined,
        model: undefined,
      })
      await db.local_subtitles.update('file-sub-1', {
        sourceKind: 'manual_upload',
        name: 'casetitle.srt',
        provider: undefined,
        model: undefined,
      })

      const result = await DownloadsRepository.exportAllSubtitleVersions(trackId, 'my-episode')

      expect(result.ok).toBe(true)
      if (!result.blob) {
        throw new Error('Expected export-all zip blob to be defined')
      }
      await expect(zipContainsEntry(result.blob, 'CaseTitle.srt')).resolves.toBe(true)
      await expect(zipContainsEntry(result.blob, 'casetitle-2.srt')).resolves.toBe(true)
    })

    it('uses original filename for manual upload subtitles in export-all zip', async () => {
      const { trackId } = await createDownloadWithSubtitles(2)
      await db.local_subtitles.update('file-sub-0', {
        sourceKind: 'manual_upload',
        name: 'manual-subtitle.vtt',
        provider: undefined,
        model: undefined,
      })
      await db.local_subtitles.update('file-sub-1', {
        sourceKind: 'asr_online',
        provider: 'groq',
        model: 'whisper-large-v3',
        createdAt: Date.UTC(2026, 2, 3, 12, 0, 0),
      })

      const result = await DownloadsRepository.exportAllSubtitleVersions(trackId, 'my-episode')

      expect(result.ok).toBe(true)
      if (!result.blob) {
        throw new Error('Expected export-all zip blob to be defined')
      }
      await expect(zipContainsEntry(result.blob, 'manual-subtitle.vtt')).resolves.toBe(true)
      await expect(
        zipContainsEntry(result.blob, 'my-episode.groq.whisper-large-v3.2026-03-03.srt')
      ).resolves.toBe(true)
      await expect(blobToRawText(result.blob)).resolves.toContain('WEBVTT')
      await expect(zipContainsEntry(result.blob, 'unknown-provider')).resolves.toBe(false)
      await expect(zipContainsEntry(result.blob, 'unknown-model')).resolves.toBe(false)
    })

    it('sets UTF-8 flag(bit11) for non-ASCII manual subtitle filenames in zip headers', async () => {
      const { trackId } = await createDownloadWithSubtitles(1)
      const utf8Filename = '中文字幕.vtt'
      await db.local_subtitles.update('file-sub-0', {
        sourceKind: 'manual_upload',
        name: utf8Filename,
        provider: undefined,
        model: undefined,
      })

      const result = await DownloadsRepository.exportAllSubtitleVersions(trackId, 'my-episode')

      expect(result.ok).toBe(true)
      expect(result.blob).toBeDefined()
      if (!result.blob) {
        throw new Error('Expected export-all zip blob to be defined')
      }

      const bytes = await blobToBytes(result.blob)
      const flags = readUtf8ZipGeneralPurposeFlags(bytes, utf8Filename)

      expect(flags).not.toBeNull()
      if (flags) {
        expect(flags.local & 0x0800).toBe(0x0800)
        expect(flags.central & 0x0800).toBe(0x0800)
      }
    })
  })

  describe('exportTrackBundle', () => {
    it('exports audio + subtitles together as zip', async () => {
      const audioId = await DB.addAudioBlob(
        new Blob(['audio-bytes'], { type: 'audio/mpeg' }),
        'episode-audio.mp3'
      )
      const trackId = await DB.addPodcastDownload({
        name: 'Bundle Episode',
        audioId,
        sourceUrlNormalized: 'https://example.com/bundle.mp3',
        downloadedAt: Date.now(),
        sizeBytes: 2048,
        countryAtSave: 'US',
      })

      const subtitleId = await DB.addSubtitle([{ start: 0, end: 1, text: 'hello' }], 'sub-0.srt')
      await db.local_subtitles.add({
        id: 'bundle-sub-0',
        trackId,
        subtitleId,
        name: 'Bundle Subtitle',
        sourceKind: 'asr_online',
        provider: 'groq',
        model: 'whisper-large-v3',
        language: 'en',
        createdAt: Date.UTC(2026, 2, 3, 12, 0, 0),
        status: 'ready',
      })

      const result = await DownloadsRepository.exportTrackBundle(trackId, 'bundle-episode')

      expect(result.ok).toBe(true)
      expect(result.filename).toBe('bundle-episode.download.zip')
      expect(result.blob).toBeDefined()
      if (!result.blob) {
        throw new Error('Expected bundle zip blob to be defined')
      }
      await expect(zipContainsEntry(result.blob, 'episode-audio.mp3')).resolves.toBe(true)
      await expect(
        zipContainsEntry(result.blob, 'bundle-episode.groq.whisper-large-v3.2026-03-03.srt')
      ).resolves.toBe(true)
    })

    it('exports audio-only zip when no subtitles exist', async () => {
      const audioId = await DB.addAudioBlob(new Blob(['audio-only']), 'only-audio.m4a')
      const trackId = await DB.addPodcastDownload({
        name: 'Audio Only Episode',
        audioId,
        sourceUrlNormalized: 'https://example.com/audio-only.m4a',
        downloadedAt: Date.now(),
        sizeBytes: 1024,
        countryAtSave: 'US',
      })

      const result = await DownloadsRepository.exportTrackBundle(trackId, 'audio-only-episode')

      expect(result.ok).toBe(true)
      expect(result.blob).toBeDefined()
      if (!result.blob) {
        throw new Error('Expected bundle zip blob to be defined')
      }
      await expect(zipContainsEntry(result.blob, 'only-audio.m4a')).resolves.toBe(true)
      await expect(blobToRawText(result.blob)).resolves.not.toContain('.srt')
    })

    it('returns failure when bundle exceeds export size threshold', async () => {
      const audioId = await DB.addAudioBlob(new Blob(['audio-only']), 'too-large-audio.m4a')
      const trackId = await DB.addPodcastDownload({
        name: 'Too Large Episode',
        audioId,
        sourceUrlNormalized: 'https://example.com/too-large.m4a',
        downloadedAt: Date.now(),
        sizeBytes: 401 * 1024 * 1024,
        countryAtSave: 'US',
      })
      const audioBlobGetSpy = vi.spyOn(db.audioBlobs, 'get')
      audioBlobGetSpy.mockResolvedValueOnce({
        id: audioId,
        filename: 'too-large-audio.m4a',
        blob: { size: 401 * 1024 * 1024 } as Blob,
      })

      const result = await DownloadsRepository.exportTrackBundle(trackId, 'too-large-episode')

      expect(result.ok).toBe(false)
      expect(result.blob).toBeUndefined()
      expect(result.failedItems).toEqual([
        {
          name: 'bundle',
          reason: 'bundle_too_large',
        },
      ])
      audioBlobGetSpy.mockRestore()
    })

    it('uses actual blob size as guard when metadata size is underestimated', async () => {
      const audioId = await DB.addAudioBlob(new Blob(['blob-bytes']), 'underestimated-audio.m4a')
      const trackId = await DB.addPodcastDownload({
        name: 'Underestimated Metadata Episode',
        audioId,
        sourceUrlNormalized: 'https://example.com/underestimated.m4a',
        downloadedAt: Date.now(),
        sizeBytes: 128,
        countryAtSave: 'US',
      })
      const audioBlobGetSpy = vi.spyOn(db.audioBlobs, 'get')
      audioBlobGetSpy.mockResolvedValueOnce({
        id: audioId,
        filename: 'underestimated-audio.m4a',
        blob: { size: 401 * 1024 * 1024 } as Blob,
      })

      const result = await DownloadsRepository.exportTrackBundle(trackId, 'underestimated-episode')

      expect(result.ok).toBe(false)
      expect(result.blob).toBeUndefined()
      expect(result.failedItems).toEqual([
        {
          name: 'bundle',
          reason: 'bundle_too_large',
        },
      ])
      audioBlobGetSpy.mockRestore()
    })
  })
})

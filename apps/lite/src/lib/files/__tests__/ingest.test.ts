// src/lib/files/__tests__/ingest.test.ts
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../../dexieDb'

// Mock audio constructor before importing the module
class MockAudio {
  src: string = ''
  duration: number = 225 // 3:45
  private handlers: Record<string, (() => void)[]> = {}

  constructor(_src?: string) {
    if (_src) this.src = _src
    // Trigger loadedmetadata event asynchronously
    setTimeout(() => {
      this.handlers.loadedmetadata?.forEach((h) => {
        h()
      })
    }, 0)
  }

  addEventListener(event: string, handler: () => void) {
    if (!this.handlers[event]) this.handlers[event] = []
    this.handlers[event].push(handler)
  }
}

beforeAll(() => {
  vi.stubGlobal('Audio', MockAudio)
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  })
})

// Mock Worker
const mockPostMessage = vi.fn()
// We need a way to access the current worker instance from the test to trigger onmessage
// biome-ignore lint/suspicious/noExplicitAny: Mock worker reference
let currentWorker: any = null

vi.mock('../metadata.worker?worker', () => {
  return {
    default: class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null
      onerror: ((e: ErrorEvent) => void) | null = null
      terminate = vi.fn()
      postMessage = mockPostMessage

      constructor() {
        currentWorker = this
      }
    },
  }
})

// Now import the module after mocks are set up
import { ingestFiles } from '../ingest'

describe('ingestFiles', () => {
  beforeEach(async () => {
    // Clear all data before each test
    await DB.clearAllData()
    vi.clearAllMocks()
    currentWorker = null

    // Default mock behavior: return empty metadata immediately
    mockPostMessage.mockImplementation((_file) => {
      setTimeout(() => {
        if (currentWorker?.onmessage) {
          currentWorker.onmessage({
            data: { success: true, data: {} },
          } as MessageEvent)
        }
      }, 0)
    })
  })

  /**
   * Create a mock file with proper text() method support
   */
  const createMockFile = (name: string, type: string, content: string = ''): File => {
    const blob = new Blob([content], { type })
    const file = new File([blob], name, { type })
    // Ensure text() method is available (File inherits from Blob)
    return file
  }

  describe('audio-only ingestion', () => {
    it('should create track for audio file', async () => {
      const audioFile = createMockFile('test-song.mp3', 'audio/mpeg', 'fake audio data')

      const result = await ingestFiles({
        files: [audioFile],
        folderId: null,
      })

      expect(result.createdTrackIds).toHaveLength(1)
      expect(result.attachedSubtitleCount).toBe(0)

      // Verify track was created in DB
      const tracks = await DB.getFileTracksInFolder(null)
      expect(tracks).toHaveLength(1)
      expect(tracks[0].name).toBe('test-song')
      expect(tracks[0].durationSeconds).toBe(225) // Fallback to Audio element
    })

    it('should prioritize metadata title over filename', async () => {
      // Mock worker response with metadata
      mockPostMessage.mockImplementation(() => {
        setTimeout(() => {
          if (currentWorker?.onmessage) {
            currentWorker.onmessage({
              data: {
                success: true,
                data: { title: 'Real Song Title', duration: 100 },
              },
            } as MessageEvent)
          }
        }, 0)
      })

      const audioFile = createMockFile('ignored-filename.mp3', 'audio/mpeg')
      await ingestFiles({
        files: [audioFile],
        folderId: null,
      })

      const tracks = await DB.getFileTracksInFolder(null)
      expect(tracks[0].name).toBe('Real Song Title')
      expect(tracks[0].durationSeconds).toBe(100)
    })

    it('should assign track to specified folder', async () => {
      // Create folder first
      const folderId = await DB.addFolder('Test Folder')
      const audioFile = createMockFile('folder-song.mp3', 'audio/mpeg')

      const result = await ingestFiles({
        files: [audioFile],
        folderId,
      })

      expect(result.createdTrackIds).toHaveLength(1)

      // Verify track is in folder
      const tracksInFolder = await DB.getFileTracksInFolder(folderId)
      expect(tracksInFolder).toHaveLength(1)
      expect(tracksInFolder[0].name).toBe('folder-song')
      expect(tracksInFolder[0].sizeBytes).toBe(audioFile.size)
    })
  })

  describe('audio with matching subtitle', () => {
    it('should attach subtitle with matching base name', async () => {
      const audioFile = createMockFile('podcast-episode.mp3', 'audio/mpeg')
      // Create a proper SRT file with text content
      const srtContent = '1\n00:00:00,000 --> 00:00:01,000\nHello'
      const srtBlob = new Blob([srtContent], { type: 'text/plain' })
      const srtFile = new File([srtBlob], 'podcast-episode.srt', { type: 'text/plain' })

      const result = await ingestFiles({
        files: [audioFile, srtFile],
        folderId: null,
      })

      expect(result.createdTrackIds).toHaveLength(1)
      expect(result.attachedSubtitleCount).toBe(1)

      // Verify subtitle was attached
      const trackId = result.createdTrackIds[0]
      const subtitles = await DB.getFileSubtitlesForTrack(trackId)
      expect(subtitles).toHaveLength(1)
      expect(subtitles[0].name).toBe('podcast-episode.srt')
    })

    it('should attach subtitle with matching prefix', async () => {
      const audioFile = createMockFile('episode01.mp3', 'audio/mpeg')
      const srtBlob = new Blob(['subtitle content'], { type: 'text/plain' })
      const srtFile = new File([srtBlob], 'episode01.en.srt', { type: 'text/plain' })

      const result = await ingestFiles({
        files: [audioFile, srtFile],
        folderId: null,
      })

      expect(result.attachedSubtitleCount).toBe(1)
    })
  })

  describe('non-matching subtitle', () => {
    it('should not attach subtitle with different base name', async () => {
      const audioFile = createMockFile('song-a.mp3', 'audio/mpeg')
      const srtBlob = new Blob(['subtitle content'], { type: 'text/plain' })
      const srtFile = new File([srtBlob], 'song-b.srt', { type: 'text/plain' })

      const result = await ingestFiles({
        files: [audioFile, srtFile],
        folderId: null,
      })

      expect(result.createdTrackIds).toHaveLength(1)
      expect(result.attachedSubtitleCount).toBe(0)

      // Verify no subtitle attached
      const trackId = result.createdTrackIds[0]
      const subtitles = await DB.getFileSubtitlesForTrack(trackId)
      expect(subtitles).toHaveLength(0)
    })
  })

  describe('multiple files', () => {
    it('should process multiple audio files with correct counts', async () => {
      const audio1 = createMockFile('track1.mp3', 'audio/mpeg')
      const audio2 = createMockFile('track2.mp3', 'audio/mpeg')
      const srt1Blob = new Blob(['sub1'], { type: 'text/plain' })
      const srt1 = new File([srt1Blob], 'track1.srt', { type: 'text/plain' })
      const srt3Blob = new Blob(['sub3'], { type: 'text/plain' })
      const srt3 = new File([srt3Blob], 'track3.srt', { type: 'text/plain' }) // no matching audio

      const result = await ingestFiles({
        files: [audio1, audio2, srt1, srt3],
        folderId: null,
      })

      expect(result.createdTrackIds).toHaveLength(2)
      expect(result.attachedSubtitleCount).toBe(1) // only track1.srt matches
    })
  })
})

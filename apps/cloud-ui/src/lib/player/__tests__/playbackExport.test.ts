import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../../store/playerStore'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { TRACK_SOURCE } from '../../db/types'
import { downloadBlob } from '../../download'
import { downloadEpisode, removeDownloadedTrack } from '../../downloadService'
import {
  hasStoredTranscriptSource,
  persistImportedTranscriptForPlaybackIdentity,
} from '../../remoteTranscript'
import { DownloadsRepository } from '../../repositories/DownloadsRepository'
import { FilesRepository } from '../../repositories/FilesRepository'
import {
  exportCurrentAudioForPlayback,
  exportCurrentTranscriptAndAudioBundle,
  exportCurrentTranscriptForPlayback,
  importTranscriptForCurrentPlayback,
  TRANSCRIPT_IMPORTED_EVENT,
} from '../playbackExport'

vi.mock('../../download', () => ({
  downloadBlob: vi.fn(),
}))

vi.mock('../../downloadService', () => ({
  downloadEpisode: vi.fn(),
  removeDownloadedTrack: vi.fn(),
}))

vi.mock('../../repositories/FilesRepository', () => ({
  FilesRepository: {
    getTrackById: vi.fn(),
    importTranscriptVersion: vi.fn(),
    updateFileTrack: vi.fn(),
    exportActiveTranscriptVersion: vi.fn(),
    exportAudioFile: vi.fn(),
  },
}))

vi.mock('../../repositories/DownloadsRepository', () => ({
  DownloadsRepository: {
    getTrackSnapshot: vi.fn(),
    importSubtitleVersion: vi.fn(),
    setActiveSubtitle: vi.fn(),
    deleteSubtitleVersion: vi.fn(),
    exportActiveTranscriptVersion: vi.fn(),
    exportAudioFile: vi.fn(),
  },
}))

vi.mock('../../remoteTranscript', () => ({
  persistImportedTranscriptForPlaybackIdentity: vi.fn(),
  hasStoredTranscriptSource: vi.fn(),
  loadRemoteTranscriptWithCache: vi.fn(),
  getValidTranscriptUrl: vi.fn((url?: string | null) => url ?? null),
}))

vi.mock('../../runtimeConfig', () => ({
  getAppConfig: () => ({ DEFAULT_COUNTRY: 'US' }),
}))

function makeUserUploadTrack() {
  return {
    id: 'track-user-1',
    sourceType: TRACK_SOURCE.USER_UPLOAD,
    audioId: 'audio-user-1',
    name: 'Local Track',
    folderId: null,
    createdAt: Date.now(),
    sizeBytes: 1024,
  }
}

function makePodcastTrack() {
  return {
    id: 'track-download-1',
    sourceType: TRACK_SOURCE.PODCAST_DOWNLOAD,
    audioId: 'audio-download-1',
    name: 'Downloaded Episode',
    sizeBytes: 1024,
    createdAt: Date.now(),
    downloadedAt: Date.now(),
    lastAccessedAt: Date.now(),
    countryAtSave: 'US',
    sourceUrlNormalized: 'https://example.com/episode.mp3',
    sourceEpisodeTitle: 'Downloaded Episode',
  }
}

async function blobToLatin1Text(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    return new TextDecoder('latin1').decode(await blob.arrayBuffer())
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(new TextDecoder('latin1').decode(reader.result as ArrayBuffer))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }

  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

describe('playbackExport helper routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTranscriptStore.getState().resetTranscript()
    usePlayerStore.setState({
      audioLoaded: false,
      audioUrl: null,
      audioTitle: '',
      coverArtUrl: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      pendingSeek: null,
      autoplayAfterPendingSeek: false,
      sessionId: null,
      sessionPersistenceSuspended: false,
      localTrackId: null,
      episodeMetadata: null,
      status: 'idle',
      loadRequestId: 0,
    })
  })

  it('routes imported transcript for a user-upload track and makes it active', async () => {
    const track = makeUserUploadTrack()
    const importedEvent = vi.fn()
    window.addEventListener(TRANSCRIPT_IMPORTED_EVENT, importedEvent)

    vi.mocked(FilesRepository.getTrackById).mockResolvedValue(track as never)
    vi.mocked(FilesRepository.importTranscriptVersion).mockResolvedValue({
      ok: true,
      reason: 'imported',
      fileSubtitleId: 'file-sub-user-1',
    })
    vi.mocked(FilesRepository.updateFileTrack).mockResolvedValue(undefined)

    usePlayerStore.setState({
      audioUrl: 'blob:user-track',
      audioTitle: 'Local Track',
      localTrackId: track.id,
      episodeMetadata: {
        originalAudioUrl: 'blob:user-track',
        transcriptUrl: 'https://example.com/transcript.vtt',
        playbackRequestMode: 'stream_without_transcript',
      },
    })

    const result = await importTranscriptForCurrentPlayback(
      new File(['1\n00:00:00,000 --> 00:00:01,000\nHello'], 'imported.srt', {
        type: 'text/plain',
      })
    )

    expect(result.ok).toBe(true)
    expect(FilesRepository.importTranscriptVersion).toHaveBeenCalledWith(track.id, {
      filename: 'imported.srt',
      content: expect.stringContaining('Hello'),
    })
    expect(FilesRepository.updateFileTrack).toHaveBeenCalledWith(track.id, {
      activeSubtitleId: 'file-sub-user-1',
    })
    expect(persistImportedTranscriptForPlaybackIdentity).not.toHaveBeenCalled()
    expect(useTranscriptStore.getState().subtitles).toHaveLength(1)
    expect(usePlayerStore.getState().episodeMetadata?.playbackRequestMode).toBe('default')
    expect(importedEvent).toHaveBeenCalledTimes(1)

    window.removeEventListener(TRANSCRIPT_IMPORTED_EVENT, importedEvent)
  })

  it('routes imported transcript for a downloaded podcast track and activates it', async () => {
    const track = makePodcastTrack()
    vi.mocked(FilesRepository.getTrackById).mockResolvedValue(track as never)
    vi.mocked(DownloadsRepository.importSubtitleVersion).mockResolvedValue({
      ok: true,
      reason: 'imported',
      fileSubtitleId: 'file-sub-download-1',
    })
    vi.mocked(DownloadsRepository.setActiveSubtitle).mockResolvedValue(true)

    usePlayerStore.setState({
      audioUrl: 'blob:download-track',
      audioTitle: 'Downloaded Episode',
      localTrackId: track.id,
      episodeMetadata: {
        originalAudioUrl: 'https://example.com/episode.mp3',
        playbackRequestMode: 'stream_without_transcript',
      },
    })

    const result = await importTranscriptForCurrentPlayback(
      new File(['1\n00:00:00,000 --> 00:00:01,000\nHello'], 'imported.srt', {
        type: 'text/plain',
      })
    )

    expect(result.ok).toBe(true)
    expect(DownloadsRepository.importSubtitleVersion).toHaveBeenCalledWith(track.id, {
      filename: 'imported.srt',
      content: expect.stringContaining('Hello'),
    })
    expect(DownloadsRepository.setActiveSubtitle).toHaveBeenCalledWith(
      track.id,
      'file-sub-download-1',
      true
    )
    expect(useTranscriptStore.getState().subtitles).toHaveLength(1)
    expect(usePlayerStore.getState().episodeMetadata?.playbackRequestMode).toBe('default')
  })

  it('routes imported transcript for remote playback through the remote transcript cache', async () => {
    vi.mocked(hasStoredTranscriptSource).mockResolvedValue(false)
    vi.mocked(persistImportedTranscriptForPlaybackIdentity).mockResolvedValue(true)

    usePlayerStore.setState({
      audioUrl: 'https://example.com/episode.mp3',
      audioTitle: 'Remote Episode',
      localTrackId: null,
      episodeMetadata: {
        originalAudioUrl: 'https://example.com/episode.mp3',
        playbackRequestMode: 'stream_without_transcript',
      },
    })

    const result = await importTranscriptForCurrentPlayback(
      new File(['1\n00:00:00,000 --> 00:00:01,000\nHello'], 'imported.srt', {
        type: 'text/plain',
      })
    )

    expect(result.ok).toBe(true)
    expect(persistImportedTranscriptForPlaybackIdentity).toHaveBeenCalledWith(
      'https://example.com/episode.mp3',
      expect.arrayContaining([expect.objectContaining({ text: 'Hello' })])
    )
    expect(useTranscriptStore.getState().subtitles).toHaveLength(1)
  })

  it('does not corrupt playback mode or transcript state when import fails', async () => {
    const track = makeUserUploadTrack()
    vi.mocked(FilesRepository.getTrackById).mockResolvedValue(track as never)
    vi.mocked(FilesRepository.importTranscriptVersion).mockResolvedValue({
      ok: false,
      reason: 'invalid_transcript_content',
    })

    useTranscriptStore.getState().setSubtitles([{ start: 0, end: 1, text: 'Existing cue' }])
    usePlayerStore.setState({
      audioUrl: 'blob:user-track',
      audioTitle: 'Local Track',
      localTrackId: track.id,
      episodeMetadata: {
        originalAudioUrl: 'blob:user-track',
        playbackRequestMode: 'stream_without_transcript',
      },
    })

    const result = await importTranscriptForCurrentPlayback(
      new File(['1\n00:00:00,000 --> 00:00:01,000\nHello'], 'imported.srt', {
        type: 'text/plain',
      })
    )

    expect(result.ok).toBe(false)
    expect(FilesRepository.importTranscriptVersion).toHaveBeenCalledWith(track.id, {
      filename: 'imported.srt',
      content: expect.stringContaining('Hello'),
    })
    expect(FilesRepository.updateFileTrack).not.toHaveBeenCalled()
    expect(useTranscriptStore.getState().subtitles).toEqual([
      { start: 0, end: 1, text: 'Existing cue' },
    ])
    expect(usePlayerStore.getState().episodeMetadata?.playbackRequestMode).toBe(
      'stream_without_transcript'
    )
  })

  it('exports the active transcript through the current playback identity', async () => {
    const track = makeUserUploadTrack()
    vi.mocked(FilesRepository.getTrackById).mockResolvedValue(track as never)
    vi.mocked(FilesRepository.exportActiveTranscriptVersion).mockResolvedValue({
      ok: true,
      filename: 'Local Track.transcript.srt',
      blob: new Blob(['transcript'], { type: 'text/plain;charset=utf-8' }),
    })

    usePlayerStore.setState({
      audioUrl: 'blob:user-track',
      audioTitle: 'Local Track',
      localTrackId: track.id,
      episodeMetadata: {
        originalAudioUrl: 'blob:user-track',
        playbackRequestMode: 'default',
      },
    })
    useTranscriptStore.getState().setSubtitles([{ start: 0, end: 1, text: 'Hello' }])

    const result = await exportCurrentTranscriptForPlayback()

    expect(result.ok).toBe(true)
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Local Track.transcript.srt')
  })

  it('exports remote-only audio through the existing download contract', async () => {
    vi.mocked(hasStoredTranscriptSource).mockResolvedValue(true)
    vi.mocked(downloadEpisode).mockResolvedValue({
      ok: true,
      trackId: 'download-temp-1',
      reason: 'already_downloaded',
    })
    vi.mocked(DownloadsRepository.exportAudioFile).mockResolvedValue({
      ok: true,
      filename: 'Remote Episode.mp3',
      blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    })

    usePlayerStore.setState({
      audioUrl: 'https://example.com/episode.mp3',
      audioTitle: 'Remote Episode',
      localTrackId: null,
      episodeMetadata: {
        originalAudioUrl: 'https://example.com/episode.mp3',
        playbackRequestMode: 'default',
        countryAtSave: 'US',
      },
    })

    const result = await exportCurrentAudioForPlayback()

    expect(result.ok).toBe(true)
    expect(downloadEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        audioUrl: 'https://example.com/episode.mp3',
        episodeTitle: 'Remote Episode',
        countryAtSave: 'us',
        silent: true,
      })
    )
    expect(DownloadsRepository.exportAudioFile).toHaveBeenCalledWith(
      'download-temp-1',
      'Remote Episode'
    )
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Remote Episode.mp3')
    expect(removeDownloadedTrack).not.toHaveBeenCalled()
  })

  it('cleans up temporary downloaded audio after remote export completes', async () => {
    vi.mocked(downloadEpisode).mockResolvedValue({
      ok: true,
      trackId: 'download-temp-2',
      reason: 'exported_for_download',
    } as never)
    vi.mocked(DownloadsRepository.exportAudioFile).mockResolvedValue({
      ok: true,
      filename: 'Remote Episode.mp3',
      blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    })

    usePlayerStore.setState({
      audioUrl: 'https://example.com/episode.mp3',
      audioTitle: 'Remote Episode',
      localTrackId: null,
      episodeMetadata: {
        originalAudioUrl: 'https://example.com/episode.mp3',
        playbackRequestMode: 'default',
        countryAtSave: 'US',
      },
    })

    const result = await exportCurrentAudioForPlayback()

    expect(result.ok).toBe(true)
    expect(removeDownloadedTrack).toHaveBeenCalledWith('download-temp-2', {
      suppressNotify: true,
    })
  })

  it('exports local audio through the existing file export helper without mutating playback state', async () => {
    const track = makeUserUploadTrack()
    vi.mocked(FilesRepository.getTrackById).mockResolvedValue(track as never)
    vi.mocked(FilesRepository.exportAudioFile).mockResolvedValue({
      ok: true,
      filename: 'Local Track.mp3',
      blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    })

    usePlayerStore.setState({
      audioUrl: 'blob:user-track',
      audioTitle: 'Local Track',
      localTrackId: track.id,
      isPlaying: true,
      progress: 42,
      episodeMetadata: {
        originalAudioUrl: 'blob:user-track',
        playbackRequestMode: 'default',
      },
    })

    const result = await exportCurrentAudioForPlayback()

    expect(result.ok).toBe(true)
    expect(FilesRepository.exportAudioFile).toHaveBeenCalledWith(track.id, 'Local Track')
    expect(downloadEpisode).not.toHaveBeenCalled()
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Local Track.mp3')
    expect(usePlayerStore.getState().audioUrl).toBe('blob:user-track')
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    expect(usePlayerStore.getState().progress).toBe(42)
  })

  it('returns no_audio for bundle export when transcript is available but audio is not exportable', async () => {
    vi.mocked(FilesRepository.getTrackById).mockResolvedValue(undefined as never)
    vi.mocked(DownloadsRepository.getTrackSnapshot).mockResolvedValue(undefined as never)
    vi.mocked(hasStoredTranscriptSource).mockResolvedValue(false)

    usePlayerStore.setState({
      audioUrl: null,
      audioTitle: 'Orphaned Session',
      localTrackId: 'missing-track',
      episodeMetadata: {
        originalAudioUrl: undefined,
        playbackRequestMode: 'default',
      },
    })
    useTranscriptStore.getState().setSubtitles([{ start: 0, end: 1, text: 'Hello' }])

    const result = await exportCurrentTranscriptAndAudioBundle()

    expect(result).toEqual({
      ok: false,
      reason: 'no_audio',
    })
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('builds a transcript+audio zip from the current playback identity', async () => {
    const RealDate = Date
    const fixedNow = new RealDate('2026-01-02T03:04:06.000Z')
    type DateCtorArgs =
      | []
      | [number | string | Date]
      | [number, number, number?, number?, number?, number?, number?]

    class MockDate extends RealDate {
      constructor(...args: DateCtorArgs) {
        if (args.length === 0) {
          super(fixedNow.toISOString())
          return
        }

        if (args.length === 1) {
          super(args[0])
          return
        }

        if (args.length === 2) {
          super(args[0], args[1])
          return
        }

        if (args.length === 3) {
          super(args[0], args[1], args[2])
          return
        }

        if (args.length === 4) {
          super(args[0], args[1], args[2], args[3])
          return
        }

        if (args.length === 5) {
          super(args[0], args[1], args[2], args[3], args[4])
          return
        }

        if (args.length === 6) {
          super(args[0], args[1], args[2], args[3], args[4], args[5])
          return
        }

        super(args[0], args[1], args[2], args[3], args[4], args[5], args[6])
      }

      static now(): number {
        return fixedNow.getTime()
      }
    }

    try {
      vi.stubGlobal('Date', MockDate)
      const track = makePodcastTrack()
      vi.mocked(FilesRepository.getTrackById).mockResolvedValue(track as never)
      vi.mocked(DownloadsRepository.exportActiveTranscriptVersion).mockResolvedValue({
        ok: true,
        filename: 'Downloaded Episode.transcript.srt',
        blob: new Blob(['transcript'], { type: 'text/plain;charset=utf-8' }),
      })
      vi.mocked(DownloadsRepository.exportAudioFile).mockResolvedValue({
        ok: true,
        filename: 'Downloaded Episode.mp3',
        blob: new Blob(['audio'], { type: 'audio/mpeg' }),
      })

      usePlayerStore.setState({
        audioUrl: 'blob:download-track',
        audioTitle: 'Downloaded Episode',
        localTrackId: track.id,
        episodeMetadata: {
          originalAudioUrl: 'https://example.com/episode.mp3',
          playbackRequestMode: 'default',
        },
      })
      useTranscriptStore.getState().setSubtitles([{ start: 0, end: 1, text: 'Hello' }])

      const result = await exportCurrentTranscriptAndAudioBundle()

      expect(result.ok).toBe(true)
      expect(result.filename).toBe('Downloaded Episode.transcript-and-audio.zip')
      expect(downloadBlob).toHaveBeenCalledTimes(1)

      const [blobArg, filenameArg] = vi.mocked(downloadBlob).mock.calls[0]
      expect(filenameArg).toBe('Downloaded Episode.transcript-and-audio.zip')

      const zipText = await blobToLatin1Text(blobArg as Blob)
      expect(zipText).toContain('Downloaded Episode.transcript.srt')
      expect(zipText).toContain('Downloaded Episode.mp3')

      const zipBytes = await blobToBytes(blobArg as Blob)
      const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
      const expectedDosTime =
        (fixedNow.getHours() << 11) |
        (fixedNow.getMinutes() << 5) |
        Math.floor(fixedNow.getSeconds() / 2)
      const expectedDosDate =
        ((fixedNow.getFullYear() - 1980) << 9) |
        ((fixedNow.getMonth() + 1) << 5) |
        fixedNow.getDate()
      expect(view.getUint32(0, true)).toBe(0x04034b50)
      expect(view.getUint16(6, true)).toBe(0x0800)
      expect(view.getUint16(10, true)).toBe(expectedDosTime)
      expect(view.getUint16(12, true)).toBe(expectedDosDate)
      expect(view.getUint32(zipBytes.length - 22, true)).toBe(0x06054b50)
      expect(view.getUint16(zipBytes.length - 14, true)).toBe(2)
      expect(view.getUint16(zipBytes.length - 12, true)).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

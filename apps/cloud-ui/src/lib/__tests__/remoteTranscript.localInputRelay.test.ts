import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { DB } from '../dexieDb'
import {
  __resetRemoteTranscriptStateForTests,
  retranscribeDownloadedTrackWithCurrentSettings,
  retranscribeFileTrackWithCurrentSettings,
} from '../remoteTranscript'
import { SETTINGS_STORAGE_KEY } from '../schemas/settings'

const { transcribeAudioWithRetryMock } = vi.hoisted(() => ({
  transcribeAudioWithRetryMock: vi.fn(),
}))

vi.mock('../asr', async (importActual) => {
  const actual = await importActual<typeof import('../asr')>()
  return {
    ...actual,
    transcribeAudioWithRetry: (...args: unknown[]) => transcribeAudioWithRetryMock(...args),
  }
})

function seedAsrSettings() {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3-turbo',
      proxyUrl: '',
    })
  )
}

describe('remoteTranscript local media input relay paths', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    window.__READIO_ENV__ = {
      READIO_ASR_API_KEY: 'public-asr-token',
    }

    __resetRemoteTranscriptStateForTests()
    await DB.clearAllData()
    usePlayerStore.getState().reset()
    useTranscriptStore.getState().resetTranscript()
    seedAsrSettings()
  })

  it('retranscribes a local file from the stored blob without remote fetches', async () => {
    const audioBlob = new Blob(['local audio'], { type: 'audio/mpeg' })
    const audioId = await DB.addAudioBlob(audioBlob, 'local-file.mp3')
    const trackId = await DB.addFileTrack({
      name: 'Local file',
      folderId: null,
      audioId,
      sizeBytes: audioBlob.size,
      durationSeconds: 1.2,
    })

    transcribeAudioWithRetryMock.mockResolvedValue({
      cues: [{ start: 0, end: 1.2, text: 'Local ASR line' }],
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      durationSeconds: 1.2,
    })

    const fetchMock = vi.fn(() => Promise.reject(new Error('unexpected remote fetch')))
    vi.stubGlobal('fetch', fetchMock)

    usePlayerStore.setState({
      audioUrl: 'blob:local-file-audio',
      audioLoaded: true,
      loadRequestId: 7,
      localTrackId: trackId,
      episodeMetadata: null,
    })

    const result = await retranscribeFileTrackWithCurrentSettings(trackId)

    expect(result).toMatchObject({ ok: true, reason: 'success' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(transcribeAudioWithRetryMock).toHaveBeenCalledTimes(1)
    const localCall = transcribeAudioWithRetryMock.mock.calls[0]?.[0] as {
      blob: Blob
      apiKey: string
      provider: string
      model: string
      expectedDurationSeconds?: number
      preferProgressive?: boolean
    }
    expect(localCall.apiKey).toBe('public-asr-token')
    expect(localCall.provider).toBe('groq')
    expect(localCall.model).toBe('whisper-large-v3-turbo')
    expect(localCall.expectedDurationSeconds).toBe(1.2)
    expect(localCall.preferProgressive).toBe(false)
    expect(localCall.blob).toBeDefined()
    expect(useTranscriptStore.getState().subtitles[0]?.text).toBe('Local ASR line')
    expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('idle')
    expect(useTranscriptStore.getState().transcriptIngestionError).toBeNull()
  })

  it('retranscribes a downloaded episode from the stored blob without refetching the original URL', async () => {
    const audioBlob = new Blob(['downloaded audio'], { type: 'audio/mpeg' })
    const audioId = await DB.addAudioBlob(audioBlob, 'downloaded.mp3')
    const originalAudioUrl = 'https://example.com/downloaded.mp3'
    const trackId = await DB.addPodcastDownload({
      name: 'Downloaded episode',
      audioId,
      sizeBytes: audioBlob.size,
      durationSeconds: 1.2,
      sourceUrlNormalized: originalAudioUrl,
      lastAccessedAt: Date.now(),
      downloadedAt: Date.now(),
      countryAtSave: 'us',
      sourcePodcastTitle: 'Podcast',
      sourceEpisodeTitle: 'Episode',
    })

    transcribeAudioWithRetryMock.mockResolvedValue({
      cues: [{ start: 0, end: 1.2, text: 'Downloaded ASR line' }],
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      durationSeconds: 1.2,
    })

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      return Promise.reject(new Error(`unexpected remote fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    usePlayerStore.setState({
      audioUrl: 'blob:downloaded-audio',
      audioLoaded: true,
      loadRequestId: 8,
      localTrackId: trackId,
      episodeMetadata: {
        originalAudioUrl,
      },
    })

    const result = await retranscribeDownloadedTrackWithCurrentSettings(trackId)

    expect(result).toMatchObject({ ok: true, reason: 'success' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(transcribeAudioWithRetryMock).toHaveBeenCalledTimes(1)
    const downloadCall = transcribeAudioWithRetryMock.mock.calls[0]?.[0] as {
      blob: Blob
      apiKey: string
      provider: string
      model: string
      expectedDurationSeconds?: number
    }
    expect(downloadCall.apiKey).toBe('public-asr-token')
    expect(downloadCall.provider).toBe('groq')
    expect(downloadCall.model).toBe('whisper-large-v3-turbo')
    expect(downloadCall.expectedDurationSeconds).toBe(1.2)
    expect(downloadCall.blob).toBeDefined()
    expect(useTranscriptStore.getState().subtitles[0]?.text).toBe('Downloaded ASR line')
    expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('idle')
    expect(useTranscriptStore.getState().transcriptIngestionError).toBeNull()
  })
})

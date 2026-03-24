import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ASRCue } from '../asr/types'
import { DB } from '../dexieDb'
import {
  __resetRemoteTranscriptStateForTests,
  RETRANSCRIBE_FILE_REASON,
  retranscribeFileTrackWithCurrentSettings,
} from '../remoteTranscript'
import { SETTINGS_STORAGE_KEY } from '../schemas/settings'

const { transcribeAudioWithRetryMock } = vi.hoisted(() => ({
  transcribeAudioWithRetryMock: vi.fn(),
}))

vi.mock('../asr', async () => {
  const actual = await vi.importActual<typeof import('../asr')>('../asr')
  return {
    ...actual,
    transcribeAudioWithRetry: transcribeAudioWithRetryMock,
  }
})

vi.mock('../asr/queue', () => ({
  backgroundAsrQueue: {
    enqueuePriority: async (task: () => Promise<void>) => {
      await task()
    },
    enqueue: async (task: () => Promise<void>) => {
      await task()
    },
  },
}))

vi.mock('../toast', () => ({
  toast: {
    successKey: vi.fn(),
    errorKey: vi.fn(),
  },
}))

vi.mock('../logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

function seedAsrSettings() {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3',
      asrUseCustomModel: false,
      asrCustomModelId: '',
      proxyUrl: '',
    })
  )
}

async function waitForTranscribeCall(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (transcribeAudioWithRetryMock.mock.calls.length > 0) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for transcribeAudioWithRetry to be called')
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred resolver is not initialized')
  }
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

async function createLocalTrack() {
  const audioId = await DB.addAudioBlob(new Blob(['audio-bytes'], { type: 'audio/mpeg' }), 'a.mp3')
  const trackId = await DB.addFileTrack({
    name: 'Local track',
    audioId,
    sizeBytes: 2048,
    durationSeconds: 180,
    folderId: null,
    artist: 'Author',
    album: 'Album',
  })

  const stored = await DB.getFileTrack(trackId)
  expect(stored?.sourceType).toBe('user_upload')

  return trackId
}

describe('remoteTranscript file retranscribe', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    window.__READIO_ENV__ = {
      READIO_ASR_API_KEY: 'public-asr-token',
    }

    __resetRemoteTranscriptStateForTests()
    await DB.clearAllData()
    seedAsrSettings()

    const cues: ASRCue[] = [{ start: 0, end: 1.2, text: 'hello' }]
    transcribeAudioWithRetryMock.mockResolvedValue({
      cues,
      provider: 'groq',
      model: 'whisper-large-v3',
      stats: { chunks: 1 },
    })
  })

  it('uses non-progressive chunking when retranscribing from files card', async () => {
    const trackId = await createLocalTrack()

    const result = await retranscribeFileTrackWithCurrentSettings(trackId)

    expect(result).toMatchObject({ ok: true, reason: RETRANSCRIBE_FILE_REASON.SUCCESS })
    expect(transcribeAudioWithRetryMock).toHaveBeenCalledTimes(1)
    expect(transcribeAudioWithRetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preferProgressive: false,
        provider: 'groq',
        model: 'whisper-large-v3',
      })
    )

    const versions = await DB.getFileSubtitlesForTrack(trackId)
    expect(versions).toHaveLength(1)
    expect(versions[0]?.sourceKind).toBe('asr_online')
    expect(versions[0]?.provider).toBe('groq')
    expect(versions[0]?.model).toBe('whisper-large-v3')
  })

  it('returns in_flight for duplicate retranscribe requests on the same file track', async () => {
    const trackId = await createLocalTrack()

    type MockTranscribeResult = {
      cues: ASRCue[]
      provider: string
      model: string
      stats: { chunks: number }
    }
    const deferred = createDeferred<MockTranscribeResult>()
    transcribeAudioWithRetryMock.mockImplementation(() => deferred.promise)

    const firstRequest = retranscribeFileTrackWithCurrentSettings(trackId)

    await waitForTranscribeCall()
    expect(transcribeAudioWithRetryMock).toHaveBeenCalledTimes(1)

    const secondResult = await retranscribeFileTrackWithCurrentSettings(trackId)
    expect(secondResult).toMatchObject({ ok: false, reason: RETRANSCRIBE_FILE_REASON.IN_FLIGHT })

    deferred.resolve({
      cues: [{ start: 0, end: 1, text: 'ready' }],
      provider: 'groq',
      model: 'whisper-large-v3',
      stats: { chunks: 1 },
    })
    const firstResult = await firstRequest
    expect(firstResult.ok).toBe(true)
  })
})

import { act, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { DB } from '../dexieDb'
import {
  __resetRemoteTranscriptStateForTests,
  autoIngestEpisodeTranscript,
  startOnlineASRForCurrentTrack,
} from '../remoteTranscript'
import { SETTINGS_STORAGE_KEY } from '../schemas/settings'

const { logMock, logErrorMock, warnMock, errorMock } = vi.hoisted(() => ({
  logMock: vi.fn(),
  logErrorMock: vi.fn(),
  warnMock: vi.fn(),
  errorMock: vi.fn(),
}))

// Save original to restore after tests — prevents cross-file prototype pollution
const _originalArrayBuffer = Blob.prototype.arrayBuffer
beforeAll(() => {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(this)
      })
    }
  }
})
afterAll(() => {
  Blob.prototype.arrayBuffer = _originalArrayBuffer
})

vi.mock('../toast', () => ({
  toast: {
    successKey: vi.fn(),
    errorKey: vi.fn(),
  },
}))

vi.mock('../logger', () => ({
  log: (...args: unknown[]) => logMock(...args),
  logError: (...args: unknown[]) => logErrorMock(...args),
  warn: (...args: unknown[]) => warnMock(...args),
  error: (...args: unknown[]) => errorMock(...args),
}))

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

describe('remoteTranscript ASR integration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    logMock.mockReset()
    logErrorMock.mockReset()
    warnMock.mockReset()
    errorMock.mockReset()
    localStorage.clear()
    sessionStorage.clear()
    window.__READIO_ENV__ = {
      READIO_ASR_API_KEY: 'public-asr-token',
    }

    __resetRemoteTranscriptStateForTests()
    await DB.clearAllData()
    usePlayerStore.getState().reset()
    seedAsrSettings()

    act(() => {
      usePlayerStore.setState({
        audioUrl: 'https://example.com/audio.mp3',
        audioLoaded: true,
        loadRequestId: 1,
        localTrackId: null,
      })
      useTranscriptStore.setState({
        subtitlesLoaded: false,
        transcriptIngestionStatus: 'idle',
      })
    })
  })

  it('enforces one active ASR request per track when clicked repeatedly', async () => {
    let resolveTranscribe: (() => void) | null = null

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://example.com/audio.mp3') {
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
            status: 200,
            headers: { 'content-length': '1024' },
          })
        )
      }

      if (url === '/api/v1/asr/transcriptions') {
        const body = init?.body as FormData
        expect(body.get('provider')).toBe('groq')
        expect(body.get('model')).toBe('whisper-large-v3-turbo')
        expect(body.get('apiKey')).toBe('public-asr-token')
        expect(body.get('audio')).toBeInstanceOf(File)
        return new Promise<Response>((resolve) => {
          resolveTranscribe = () => {
            resolve(
              new Response(
                JSON.stringify({
                  cues: [{ start: 0, end: 1.2, text: 'ASR line' }],
                  provider: 'groq',
                  model: 'whisper-large-v3-turbo',
                }),
                {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                }
              )
            )
          }
        })
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    startOnlineASRForCurrentTrack('manual')
    startOnlineASRForCurrentTrack('manual')

    await waitFor(() => expect(resolveTranscribe).not.toBeNull())
    ;(resolveTranscribe as (() => void) | null)?.()

    await waitFor(() => {
      expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    })

    const audioRequests = fetchMock.mock.calls.filter(
      (call) => call[0] === 'https://example.com/audio.mp3'
    )
    const transcribeRequests = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/v1/asr/transcriptions'
    )

    expect(audioRequests).toHaveLength(1)
    expect(transcribeRequests).toHaveLength(1)
  })

  it('aborts in-flight ASR request when track switches', async () => {
    let transcribeSignal: AbortSignal | undefined

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://example.com/audio.mp3') {
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
            status: 200,
            headers: { 'content-length': '1024' },
          })
        )
      }

      if (url === '/api/v1/asr/transcriptions') {
        transcribeSignal = init?.signal ?? undefined
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            {
              once: true,
            }
          )
        })
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    startOnlineASRForCurrentTrack('manual')

    await waitFor(() => {
      expect(transcribeSignal).toBeDefined()
    })

    act(() => {
      usePlayerStore.getState().setAudioUrl('https://example.com/new-track.mp3', 'Next Track')
    })

    expect(transcribeSignal?.aborted).toBe(true)
    expect(useTranscriptStore.getState().abortAsrController).toBeNull()
    expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('idle')
  })

  it('ignores a stale relay completion that resolves after the track switches', async () => {
    let resolveTranscribe: ((response: Response) => void) | null = null

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://example.com/audio.mp3') {
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
            status: 200,
            headers: { 'content-length': '1024' },
          })
        )
      }

      if (url === '/api/v1/asr/transcriptions') {
        return new Promise<Response>((resolve) => {
          resolveTranscribe = resolve
        })
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    startOnlineASRForCurrentTrack('manual')

    await waitFor(() => {
      expect(resolveTranscribe).not.toBeNull()
    })

    act(() => {
      usePlayerStore.getState().setAudioUrl('https://example.com/new-track.mp3', 'Next Track')
    })

    if (!resolveTranscribe) {
      throw new Error('stale relay resolver was not captured')
    }
    const completeStaleRelay: (response: Response) => void = resolveTranscribe

    completeStaleRelay(
      new Response(
        JSON.stringify({
          cues: [{ start: 0, end: 1.2, text: 'stale line' }],
          provider: 'groq',
          model: 'whisper-large-v3-turbo',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(usePlayerStore.getState().audioUrl).toBe('https://example.com/new-track.mp3')
    expect(useTranscriptStore.getState().subtitlesLoaded).toBe(false)
    expect(useTranscriptStore.getState().subtitles).toHaveLength(0)
    expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('idle')
    expect(useTranscriptStore.getState().transcriptIngestionError).toBeNull()
  })

  it('falls back through /api/proxy when direct audio fetch returns 500', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://example.com/audio.mp3') {
        return Promise.resolve(new Response('upstream error', { status: 500 }))
      }

      if (url === '/api/proxy') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { url: string; method: string }
        expect(body.url).toBe('https://example.com/audio.mp3')
        expect(body.method).toBe('GET')
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
            status: 200,
            headers: { 'content-length': '1024' },
          })
        )
      }

      if (url === '/api/v1/asr/transcriptions') {
        const body = init?.body as FormData
        expect(body.get('provider')).toBe('groq')
        expect(body.get('model')).toBe('whisper-large-v3-turbo')
        expect(body.get('apiKey')).toBe('public-asr-token')
        expect(body.get('audio')).toBeInstanceOf(File)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              cues: [{ start: 0, end: 1.2, text: 'ASR line' }],
              provider: 'groq',
              model: 'whisper-large-v3-turbo',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    startOnlineASRForCurrentTrack('manual')

    await waitFor(() => {
      expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    })

    const directAudioCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === 'https://example.com/audio.mp3'
    )
    const proxyCalls = fetchMock.mock.calls.filter((call) => call[0] === '/api/proxy')
    const transcribeCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/v1/asr/transcriptions'
    )

    expect(directAudioCalls).toHaveLength(1)
    expect(proxyCalls).toHaveLength(1)
    expect(transcribeCalls).toHaveLength(1)
  })

  it('falls back through /api/proxy when direct transcript fetch returns 500', async () => {
    const transcriptUrl = 'https://example.com/transcript.srt'
    const audioUrl = 'https://example.com/audio.mp3'

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === audioUrl) {
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
            status: 200,
            headers: { 'content-length': '1024' },
          })
        )
      }

      if (url === transcriptUrl) {
        return Promise.resolve(new Response('upstream error', { status: 500 }))
      }

      if (url === '/api/proxy') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { url: string; method: string }
        expect(body.url).toBe(transcriptUrl)
        expect(body.method).toBe('GET')
        return Promise.resolve(
          new Response(
            `1
00:00:00,000 --> 00:00:01,000
Transcript line
`,
            {
              status: 200,
              headers: { 'content-type': 'text/plain' },
            }
          )
        )
      }

      if (url === 'https://api.groq.com/openai/v1/audio/transcriptions') {
        return Promise.reject(new Error('should not call ASR provider when transcript exists'))
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    act(() => {
      usePlayerStore.getState().setAudioUrl(audioUrl, 'Episode')
    })

    autoIngestEpisodeTranscript(transcriptUrl, audioUrl)

    await waitFor(() => {
      expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    })

    const transcriptFetchCalls = fetchMock.mock.calls.filter((call) => call[0] === transcriptUrl)
    const proxyCalls = fetchMock.mock.calls.filter((call) => call[0] === '/api/proxy')
    const asrCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === 'https://api.groq.com/openai/v1/audio/transcriptions'
    )

    expect(transcriptFetchCalls).toHaveLength(1)
    expect(proxyCalls).toHaveLength(1)
    expect(asrCalls).toHaveLength(0)
    expect(useTranscriptStore.getState().subtitles[0]?.text).toBe('Transcript line')
  })

  it('short-circuits before automatic ASR when transcript exists, even with ASR configured', async () => {
    const transcriptUrl = 'https://example.com/transcript.srt'
    const audioUrl = 'https://example.com/audio.mp3'

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === transcriptUrl) {
        return Promise.resolve(
          new Response(
            `1
00:00:00,000 --> 00:00:01,000
Direct transcript line
`,
            {
              status: 200,
              headers: { 'content-type': 'text/plain' },
            }
          )
        )
      }

      if (
        url === audioUrl ||
        url === '/api/proxy' ||
        url === '/api/v1/asr/transcriptions' ||
        url === 'https://api.groq.com/openai/v1/audio/transcriptions'
      ) {
        return Promise.reject(new Error(`unexpected automatic ASR/download path: ${url}`))
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    act(() => {
      usePlayerStore.getState().setAudioUrl(audioUrl, 'Episode')
    })

    autoIngestEpisodeTranscript(transcriptUrl, audioUrl)

    await waitFor(() => {
      expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    })

    expect(useTranscriptStore.getState().subtitles[0]?.text).toBe('Direct transcript line')
    expect(fetchMock).toHaveBeenCalledWith(transcriptUrl, expect.any(Object))
    expect(fetchMock.mock.calls.some((call) => call[0] === audioUrl)).toBe(false)
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/proxy')).toBe(false)
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/v1/asr/transcriptions')).toBe(
      false
    )
    expect(
      fetchMock.mock.calls.some(
        (call) => call[0] === 'https://api.groq.com/openai/v1/audio/transcriptions'
      )
    ).toBe(false)
    expect(logMock).toHaveBeenCalledWith(
      '[remoteTranscript] Transcript-first branch active; automatic ASR disabled because transcript exists',
      expect.objectContaining({
        expectedAudioUrl: audioUrl,
        transcriptSourceHost: 'example.com',
      })
    )
  })

  it('does not auto-start ASR when transcript-bearing playback transcript fetch fails', async () => {
    const transcriptUrl = 'https://example.com/transcript.srt'
    const audioUrl = 'https://example.com/audio.mp3'

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === transcriptUrl) {
        return Promise.resolve(new Response('transcript upstream error', { status: 500 }))
      }

      if (url === '/api/proxy') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { url: string; method: string }
        if (body.url === transcriptUrl) {
          return Promise.resolve(new Response('proxy transcript error', { status: 500 }))
        }
        if (body.url === audioUrl) {
          return Promise.reject(new Error('audio should not be fetched for automatic ASR'))
        }
      }

      if (url === audioUrl || url === '/api/v1/asr/transcriptions') {
        return Promise.reject(new Error(`unexpected automatic ASR path: ${url}`))
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    act(() => {
      usePlayerStore.getState().setAudioUrl(audioUrl, 'Episode')
    })

    autoIngestEpisodeTranscript(transcriptUrl, audioUrl)

    await waitFor(() => {
      expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('failed')
    })

    const transcriptFetchCalls = fetchMock.mock.calls.filter((call) => call[0] === transcriptUrl)
    const proxyCalls = fetchMock.mock.calls.filter((call) => call[0] === '/api/proxy')
    const audioCalls = fetchMock.mock.calls.filter((call) => call[0] === audioUrl)
    const transcribeCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/v1/asr/transcriptions'
    )

    expect(transcriptFetchCalls).toHaveLength(1)
    expect(proxyCalls).toHaveLength(1)
    expect(audioCalls).toHaveLength(0)
    expect(transcribeCalls).toHaveLength(0)
    expect(useTranscriptStore.getState().subtitlesLoaded).toBe(false)
    expect(logMock).toHaveBeenCalledWith(
      '[remoteTranscript] Transcript fetch failed; transcript source remains available',
      expect.objectContaining({
        expectedAudioUrl: 'https://example.com/audio.mp3',
        transcriptSourceHost: 'example.com',
      })
    )
  })

  it('enters cooldown window after ASPH error and prevents subsequent requests', async () => {
    let mockDateNow = 1000000
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => mockDateNow)

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === 'https://example.com/audio.mp3') {
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), { status: 200 })
        )
      }
      if (url === '/api/v1/asr/transcriptions') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'rate_limited',
              message: 'Limit (ASPH) reached',
              status: 429,
              retryAfterMs: 61 * 60 * 1000,
            }),
            {
              status: 429,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    // Trigger first ASR request, which should hit 429 ASPH and trigger cooldown
    startOnlineASRForCurrentTrack('manual')

    // Wait for the failure to register in the state
    await waitFor(
      () => {
        expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('failed')
      },
      { timeout: 3000 }
    )

    const firstApiHitCount = fetchMock.mock.calls.filter(
      (c) => c[0] === '/api/v1/asr/transcriptions'
    ).length
    expect(firstApiHitCount).toBe(1)

    // Advance time by 5 seconds (5000ms), far short of 61 minutes
    mockDateNow += 5000

    // Trigger again (manual retry by user)
    act(() => {
      useTranscriptStore.getState().setTranscriptIngestionStatus('idle')
    })
    startOnlineASRForCurrentTrack('manual')

    // State should rapidly return to failed without hitting the API
    await waitFor(
      () => {
        expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('failed')
      },
      { timeout: 3000 }
    )

    // Assert that the transcriber API was NOT called again
    const totalApiHitCount = fetchMock.mock.calls.filter(
      (c) => c[0] === '/api/v1/asr/transcriptions'
    ).length
    expect(totalApiHitCount).toBe(firstApiHitCount)

    dateSpy.mockRestore()
  })

  it('local blob paths do not gain backend fallback', async () => {
    const blobUrl = 'blob:http://localhost/abc123'

    act(() => {
      usePlayerStore.setState({
        audioUrl: blobUrl,
        audioLoaded: true,
        loadRequestId: 2,
        localTrackId: null,
      })
    })

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === blobUrl) {
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
            status: 200,
            headers: { 'content-length': '1024' },
          })
        )
      }

      if (url === '/api/proxy') {
        throw new Error('proxy should not be called for blob URLs')
      }

      if (url === '/api/v1/asr/transcriptions') {
        const body = init?.body as FormData
        expect(body.get('provider')).toBe('groq')
        expect(body.get('model')).toBe('whisper-large-v3-turbo')
        expect(body.get('apiKey')).toBe('public-asr-token')
        expect(body.get('audio')).toBeInstanceOf(File)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              cues: [{ start: 0, end: 1.2, text: 'ASR line' }],
              provider: 'groq',
              model: 'whisper-large-v3-turbo',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    startOnlineASRForCurrentTrack('manual')

    await waitFor(() => {
      expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    })

    const blobCalls = fetchMock.mock.calls.filter((call) => call[0] === blobUrl)
    const proxyCalls = fetchMock.mock.calls.filter((call) => call[0] === '/api/proxy')

    expect(blobCalls).toHaveLength(1)
    expect(proxyCalls).toHaveLength(0)
  })

  it('direct success stays direct and does not go through proxy', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://example.com/audio.mp3') {
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
            status: 200,
            headers: { 'content-length': '1024' },
          })
        )
      }

      if (url === '/api/proxy') {
        throw new Error('proxy should not be called when direct succeeds')
      }

      if (url === '/api/v1/asr/transcriptions') {
        const body = init?.body as FormData
        expect(body.get('provider')).toBe('groq')
        expect(body.get('model')).toBe('whisper-large-v3-turbo')
        expect(body.get('apiKey')).toBe('public-asr-token')
        expect(body.get('audio')).toBeInstanceOf(File)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              cues: [{ start: 0, end: 1.2, text: 'ASR line' }],
              provider: 'groq',
              model: 'whisper-large-v3-turbo',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    startOnlineASRForCurrentTrack('manual')

    await waitFor(() => {
      expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    })

    const directAudioCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === 'https://example.com/audio.mp3'
    )
    const proxyCalls = fetchMock.mock.calls.filter((call) => call[0] === '/api/proxy')
    const transcribeCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/v1/asr/transcriptions'
    )

    expect(directAudioCalls).toHaveLength(1)
    expect(proxyCalls).toHaveLength(0)
    expect(transcribeCalls).toHaveLength(1)
  })

  it('NetworkError (TypeError) triggers fallback to /api/proxy', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://example.com/audio.mp3') {
        return Promise.reject(new TypeError('CORS error'))
      }

      if (url === '/api/proxy') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { url: string; method: string }
        expect(body.url).toBe('https://example.com/audio.mp3')
        expect(body.method).toBe('GET')
        return Promise.resolve(
          new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
            status: 200,
            headers: { 'content-length': '1024' },
          })
        )
      }

      if (url === '/api/v1/asr/transcriptions') {
        const body = init?.body as FormData
        expect(body.get('provider')).toBe('groq')
        expect(body.get('model')).toBe('whisper-large-v3-turbo')
        expect(body.get('apiKey')).toBe('public-asr-token')
        expect(body.get('audio')).toBeInstanceOf(File)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              cues: [{ start: 0, end: 1.2, text: 'ASR line' }],
              provider: 'groq',
              model: 'whisper-large-v3-turbo',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    vi.stubGlobal('fetch', fetchMock)

    startOnlineASRForCurrentTrack('manual')

    await waitFor(() => {
      expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    })

    const directAudioCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === 'https://example.com/audio.mp3'
    )
    const proxyCalls = fetchMock.mock.calls.filter((call) => call[0] === '/api/proxy')
    const transcribeCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/api/v1/asr/transcriptions'
    )

    expect(directAudioCalls).toHaveLength(1)
    expect(proxyCalls).toHaveLength(1)
    expect(transcribeCalls).toHaveLength(1)
  })
})

import { act, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { DB } from '../dexieDb'
import {
  __resetRemoteTranscriptStateForTests,
  startOnlineASRForCurrentTrack,
} from '../remoteTranscript'
import { SETTINGS_STORAGE_KEY } from '../schemas/settings'

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
      asrModel: 'whisper-large-v3-turbo',
      proxyUrl: '',
    })
  )
}

describe('remoteTranscript ASR integration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
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

      if (url === 'https://api.groq.com/openai/v1/audio/transcriptions') {
        return new Promise<Response>((resolve) => {
          resolveTranscribe = () => {
            resolve(
              new Response(
                JSON.stringify({ segments: [{ start: 0, end: 1.2, text: 'ASR line' }] }),
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
      (call) => call[0] === 'https://api.groq.com/openai/v1/audio/transcriptions'
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

      if (url === 'https://api.groq.com/openai/v1/audio/transcriptions') {
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
      if (url === 'https://api.groq.com/openai/v1/audio/transcriptions') {
        return Promise.resolve(new Response('Limit (ASPH) reached', { status: 429 }))
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
      (c) => c[0] === 'https://api.groq.com/openai/v1/audio/transcriptions'
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
      (c) => c[0] === 'https://api.groq.com/openai/v1/audio/transcriptions'
    ).length
    expect(totalApiHitCount).toBe(firstApiHitCount)

    dateSpy.mockRestore()
  })
})

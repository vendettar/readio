import { afterEach, describe, expect, it, vi } from 'vitest'
import { transcribeViaCloudRelay, verifyAsrKeyViaCloudRelay } from '../backendRelay'

describe('ASR backend relay', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.__READIO_ENV__ = undefined
  })

  it('submits transcription to the same-origin relay instead of a provider endpoint', async () => {
    window.__READIO_ENV__ = {
      READIO_ASR_RELAY_TOKEN: 'relay-public-token',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(typeof input === 'string' ? input : input.toString()).toBe('/api/v1/asr/transcriptions')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      expect(init?.headers).toEqual({
        'X-Readio-Relay-Token': 'relay-public-token',
      })

      const payload = init?.body as FormData
      expect(payload.get('provider')).toBe('groq')
      expect(payload.get('model')).toBe('whisper-large-v3')
      expect(payload.get('apiKey')).toBe('gsk_test')
      expect(payload.get('audioMimeType')).toBe('audio/mpeg')
      const audio = payload.get('audio')
      expect(audio).toBeInstanceOf(File)
      expect((audio as File).type).toBe('audio/mpeg')

      return new Response(
        JSON.stringify({
          cues: [{ start: 0, end: 1.2, text: 'relay text' }],
          durationSeconds: 1.2,
          provider: 'groq',
          model: 'whisper-large-v3',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await transcribeViaCloudRelay({
      blob: new Blob(['audio'], { type: 'audio/mpeg' }),
      apiKey: 'gsk_test',
      provider: 'groq',
      model: 'whisper-large-v3',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.provider).toBe('groq')
    expect(result.model).toBe('whisper-large-v3')
    expect(result.cues[0]?.text).toBe('relay text')
  })

  it('maps unauthorized relay responses to ASRClientError', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(typeof input === 'string' ? input : input.toString()).toBe('/api/v1/asr/transcriptions')
      return new Response(
        JSON.stringify({
          code: 'unauthorized',
          message: 'Invalid provider key',
          status: 401,
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transcribeViaCloudRelay({
        blob: new Blob(['audio'], { type: 'audio/mpeg' }),
        apiKey: 'gsk_test',
        provider: 'groq',
        model: 'whisper-large-v3',
      })
    ).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
      message: 'Invalid provider key',
    })
  })

  it('maps rate-limited relay responses to ASRClientError with retryAfterMs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(typeof input === 'string' ? input : input.toString()).toBe('/api/v1/asr/transcriptions')
      return new Response(
        JSON.stringify({
          code: 'rate_limited',
          message: 'Too many requests',
          status: 429,
          retryAfterMs: 5000,
        }),
        {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transcribeViaCloudRelay({
        blob: new Blob(['audio'], { type: 'audio/mpeg' }),
        apiKey: 'gsk_test',
        provider: 'groq',
        model: 'whisper-large-v3',
      })
    ).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
      retryAfterMs: 5000,
      message: 'Too many requests',
    })
  })

  it('maps provider 5xx relay responses to service_unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(typeof input === 'string' ? input : input.toString()).toBe('/api/v1/asr/transcriptions')
      return new Response(
        JSON.stringify({
          code: 'service_unavailable',
          message: 'Provider unavailable',
          status: 503,
        }),
        {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transcribeViaCloudRelay({
        blob: new Blob(['audio'], { type: 'audio/mpeg' }),
        apiKey: 'gsk_test',
        provider: 'groq',
        model: 'whisper-large-v3',
      })
    ).rejects.toMatchObject({
      code: 'service_unavailable',
      status: 503,
      message: 'Provider unavailable',
    })
  })

  it('submits verification to the same-origin verify relay instead of a provider endpoint', async () => {
    window.__READIO_ENV__ = {
      READIO_ASR_RELAY_TOKEN: 'relay-public-token',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(typeof input === 'string' ? input : input.toString()).toBe('/api/v1/asr/verify')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Readio-Relay-Token': 'relay-public-token',
      })

      const payload = JSON.parse(String(init?.body ?? '{}')) as {
        provider: string
        apiKey: string
      }
      expect(payload.provider).toBe('groq')
      expect(payload.apiKey).toBe('gsk_test')

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyAsrKeyViaCloudRelay({
        apiKey: 'gsk_test',
        provider: 'groq',
      })
    ).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps invalid verify relay responses to ASRClientError', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(typeof input === 'string' ? input : input.toString()).toBe('/api/v1/asr/verify')
      return new Response(
        JSON.stringify({
          code: 'unauthorized',
          message: 'provider rejected credentials',
          status: 401,
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyAsrKeyViaCloudRelay({
        apiKey: 'gsk_test',
        provider: 'groq',
      })
    ).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
      message: 'provider rejected credentials',
    })
  })
})

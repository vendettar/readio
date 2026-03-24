import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAsrKey } from '../../asr'
import {
  mapOpenAiVerboseJsonToCues,
  transcribeWithOpenAiCompatible,
} from '../../asr/providers/openaiCompatible'
import { getAsrProviderConfig } from '../../asr/registry'

const debugMock = vi.hoisted(() => vi.fn())

vi.mock('../../logger', async () => {
  const actual = await vi.importActual<typeof import('../../logger')>('../../logger')
  return {
    ...actual,
    debug: debugMock,
  }
})

describe('ASR provider (Groq) via openai-compatible transport', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    debugMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps verbose_json segments to ASR cues with words', () => {
    const cues = mapOpenAiVerboseJsonToCues({
      segments: [
        {
          start: 0,
          end: 1.5,
          text: 'hello world',
          words: [
            { word: 'hello', start: 0, end: 0.5, probability: 0.99 },
            { word: 'world', start: 0.6, end: 1.2, confidence: 0.95 },
          ],
        },
      ],
    })

    expect(cues).toHaveLength(1)
    expect(cues[0]?.text).toBe('hello world')
    expect(cues[0]?.words).toHaveLength(2)
    expect(cues[0]?.words?.[0]?.confidence).toBe(0.99)
  })

  it('appends Groq timestamp granularities to form data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          language: 'en',
          duration: 2.4,
          segments: [{ start: 0, end: 1.2, text: 'test line' }],
        }),
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    const result = await transcribeWithOpenAiCompatible({
      blob,
      apiKey: 'gsk_test',
      model: 'whisper-large-v3-turbo',
      providerConfig: getAsrProviderConfig('groq'),
    })

    const fetchMock = vi.mocked(global.fetch)
    const formData = fetchMock.mock.calls[0]?.[1]?.body as FormData
    const file = formData.get('file') as File
    expect(file.name).toBe('input.mp3')
    expect(formData.getAll('timestamp_granularities[]')).toEqual(['segment', 'word'])

    expect(result.provider).toBe('groq')
    expect(result.cues).toHaveLength(1)
    expect(result.cues[0]?.text).toBe('test line')
  })

  it('does not append timestamp granularities for non-Groq provider ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          language: 'en',
          segments: [{ start: 0, end: 1.2, text: 'test line' }],
        }),
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    const providerConfig = getAsrProviderConfig('qwen')
    await transcribeWithOpenAiCompatible({
      blob,
      apiKey: 'test',
      model: 'qwen3-asr-flash',
      providerConfig,
    })

    const fetchMock = vi.mocked(global.fetch)
    const formData = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(formData.getAll('timestamp_granularities[]')).toEqual([])
  })

  it('prefers top-level payload duration over cue-derived duration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          language: 'en',
          duration: 12.5,
          segments: [{ start: 0, end: 1.2, text: 'test line' }],
        }),
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    const result = await transcribeWithOpenAiCompatible({
      blob,
      apiKey: 'gsk_test',
      model: 'whisper-large-v3-turbo',
      providerConfig: getAsrProviderConfig('groq'),
    })

    expect(result.durationSeconds).toBe(12.5)
  })

  it('falls back to last segment cue end when top-level duration is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          language: 'en',
          segments: [
            { start: 0, end: 1.2, text: 'test line 1' },
            { start: 1.2, end: 3.8, text: 'test line 2' },
          ],
        }),
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    const result = await transcribeWithOpenAiCompatible({
      blob,
      apiKey: 'gsk_test',
      model: 'whisper-large-v3-turbo',
      providerConfig: getAsrProviderConfig('groq'),
    })

    expect(result.durationSeconds).toBe(3.8)
  })

  it('keeps duration undefined for text-only fallback cues without explicit duration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          language: 'en',
          text: 'fallback transcript text',
        }),
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    const result = await transcribeWithOpenAiCompatible({
      blob,
      apiKey: 'gsk_test',
      model: 'whisper-large-v3-turbo',
      providerConfig: getAsrProviderConfig('groq'),
    })

    expect(result.cues).toHaveLength(1)
    expect(result.durationSeconds).toBeUndefined()
  })

  it('logs Groq request id without leaking transcript content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          language: 'en',
          duration: 2.4,
          text: 'sensitive transcript payload',
          segments: [{ start: 0, end: 1.2, text: 'test line' }],
          x_groq: { id: 'req_abc123' },
        }),
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    await transcribeWithOpenAiCompatible({
      blob,
      apiKey: 'gsk_test',
      model: 'whisper-large-v3-turbo',
      providerConfig: getAsrProviderConfig('groq'),
    })

    expect(debugMock).toHaveBeenCalledWith('[ASR] Groq Request ID', {
      requestId: 'req_abc123',
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
    })
    expect(JSON.stringify(debugMock.mock.calls[0])).not.toContain('sensitive transcript payload')
  })

  it('does not emit Groq request id debug logs for non-Groq providers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          language: 'en',
          duration: 2.4,
          segments: [{ start: 0, end: 1.2, text: 'test line' }],
          x_groq: { id: 'req_should_not_log' },
        }),
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    await transcribeWithOpenAiCompatible({
      blob,
      apiKey: 'test',
      model: 'qwen3-asr-flash',
      providerConfig: getAsrProviderConfig('qwen'),
    })

    expect(debugMock).not.toHaveBeenCalled()
  })

  it('does not throw when x_groq and words are missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          language: 'en',
          duration: 2.4,
          segments: [{ start: 0, end: 1.2, text: 'segment without words' }],
        }),
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })
    await expect(
      transcribeWithOpenAiCompatible({
        blob,
        apiKey: 'gsk_test',
        model: 'whisper-large-v3-turbo',
        providerConfig: getAsrProviderConfig('groq'),
      })
    ).resolves.toMatchObject({
      cues: [{ text: 'segment without words' }],
    })
  })

  it('maps 401 as unauthorized for transcribe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: async () => 'unauthorized',
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })

    await expect(
      transcribeWithOpenAiCompatible({
        blob,
        apiKey: 'bad',
        model: 'whisper-large-v3-turbo',
        providerConfig: getAsrProviderConfig('groq'),
      })
    ).rejects.toMatchObject({ code: 'unauthorized', status: 401 })
  })

  it('verifies key by calling models endpoint and returns boolean for 200/401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null } })

    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyAsrKey({ apiKey: 'gsk_valid', provider: 'groq' })).resolves.toBe(true)
    await expect(verifyAsrKey({ apiKey: 'gsk_invalid', provider: 'groq' })).resolves.toBe(false)
  })

  it('maps 429 ASPH error to ASRClientError with asph kind and retryAfterMs fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => 'Limit (ASPH) reached',
      })
    )

    const blob = new Blob(['audio'], { type: 'audio/mpeg' })

    await expect(
      transcribeWithOpenAiCompatible({
        blob,
        apiKey: 'bad',
        model: 'whisper-large-v3-turbo',
        providerConfig: getAsrProviderConfig('groq'),
      })
    ).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
      rateLimitKind: 'asph',
      retryAfterMs: 61 * 60 * 1000,
    })
  })

  it('verifyKey throws network_error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(verifyAsrKey({ apiKey: 'gsk_test', provider: 'groq' })).rejects.toMatchObject({
      code: 'network_error',
    })
  })

  it('verifyKey throws aborted error when signal is aborted', async () => {
    // Use a plain Error with name='AbortError' since DOMException constructor
    // may not set .name correctly in all test environments (Node/JSDOM).
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    await expect(verifyAsrKey({ apiKey: 'gsk_test', provider: 'groq' })).rejects.toMatchObject({
      code: 'aborted',
    })
  })
})

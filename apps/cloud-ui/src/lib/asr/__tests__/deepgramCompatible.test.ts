import { describe, expect, it, vi } from 'vitest'
import { transcribeWithDeepgram, verifyDeepgramKey } from '../providers/deepgramCompatible'
import { getAsrProviderConfig } from '../registry'

describe('Deepgram native provider', () => {
  it('sends raw blob with token auth and fixed query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: 'hello world',
                  words: [
                    { word: 'hello', start: 0, end: 0.4, confidence: 0.98 },
                    { word: 'world', start: 0.5, end: 0.9, confidence: 0.96 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const blob = new Blob(['audio-bytes'], { type: 'audio/mpeg' })
    const providerConfig = getAsrProviderConfig('deepgram')
    const result = await transcribeWithDeepgram({
      blob,
      apiKey: 'dg_test',
      model: 'nova-3',
      providerConfig,
    })

    expect(result.cues).toHaveLength(1)
    expect(result.cues[0]?.words).toHaveLength(2)
    expect(result.durationSeconds).toBe(0.9)
    expect(result.provider).toBe('deepgram')
    expect(result.model).toBe('nova-3')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsedUrl = new URL(url)
    expect(parsedUrl.origin + parsedUrl.pathname).toBe('https://api.deepgram.com/v1/listen')
    expect(parsedUrl.searchParams.get('model')).toBe('nova-3')
    expect(parsedUrl.searchParams.get('smart_format')).toBe('true')
    expect(parsedUrl.searchParams.get('punctuate')).toBe('true')
    expect(parsedUrl.searchParams.get('paragraphs')).toBe('true')
    expect(parsedUrl.searchParams.get('diarize')).toBe('false')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Token dg_test')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('audio/mpeg')
    expect(init.body).toBe(blob)
    expect(init.body).not.toBeInstanceOf(FormData)
  })

  it('falls back to default content type when blob type is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: 'hello world',
                  words: [{ word: 'hello', start: 0, end: 1 }],
                },
              ],
            },
          ],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const blob = new Blob(['audio-bytes'])
    await transcribeWithDeepgram({
      blob,
      apiKey: 'dg_test',
      model: 'nova-3',
      providerConfig: getAsrProviderConfig('deepgram'),
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('audio/mpeg')
  })

  it('returns transcript-only fallback cue when words are missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          results: {
            channels: [
              {
                alternatives: [{ transcript: 'fallback transcript', words: [] }],
              },
            ],
          },
        }),
      })
    )

    const result = await transcribeWithDeepgram({
      blob: new Blob(['audio']),
      apiKey: 'dg_test',
      model: 'nova-3',
      providerConfig: getAsrProviderConfig('deepgram'),
    })

    expect(result.cues).toEqual([{ start: 0, end: 0, text: 'fallback transcript' }])
    expect(result.durationSeconds).toBeUndefined()
  })

  it('prefers paragraph sentences to produce multiple cues when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          results: {
            channels: [
              {
                alternatives: [
                  {
                    transcript: 'First sentence. Second sentence.',
                    words: [
                      { word: 'first', start: 0.0, end: 0.4 },
                      { word: 'sentence', start: 0.4, end: 0.9 },
                      { word: 'second', start: 1.0, end: 1.4 },
                      { word: 'sentence', start: 1.4, end: 1.9 },
                    ],
                    paragraphs: {
                      paragraphs: [
                        {
                          sentences: [
                            { text: 'First sentence.', start: 0.0, end: 0.9 },
                            { text: 'Second sentence.', start: 1.0, end: 1.9 },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        }),
      })
    )

    const result = await transcribeWithDeepgram({
      blob: new Blob(['audio']),
      apiKey: 'dg_test',
      model: 'nova-3',
      providerConfig: getAsrProviderConfig('deepgram'),
    })

    expect(result.cues).toEqual([
      { start: 0.0, end: 0.9, text: 'First sentence.' },
      { start: 1.0, end: 1.9, text: 'Second sentence.' },
    ])
    expect(result.durationSeconds).toBe(1.9)
  })

  it('fails closed when transcript and valid words are both missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          results: {
            channels: [
              {
                alternatives: [{ transcript: '   ', words: [{ word: '', start: 'x', end: null }] }],
              },
            ],
          },
        }),
      })
    )

    await expect(
      transcribeWithDeepgram({
        blob: new Blob(['audio']),
        apiKey: 'dg_test',
        model: 'nova-3',
        providerConfig: getAsrProviderConfig('deepgram'),
      })
    ).rejects.toMatchObject({ code: 'service_unavailable' })
  })

  it('maps status codes to ASRClientError taxonomy with retry-after', async () => {
    const providerConfig = getAsrProviderConfig('deepgram')
    const blob = new Blob(['audio'])

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: async () => 'unauthorized',
      })
    )
    await expect(
      transcribeWithDeepgram({ blob, apiKey: 'bad', model: 'nova-3', providerConfig })
    ).rejects.toMatchObject({ code: 'unauthorized', status: 401 })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 413,
        headers: { get: () => null },
        text: async () => 'too large',
      })
    )
    await expect(
      transcribeWithDeepgram({ blob, apiKey: 'bad', model: 'nova-3', providerConfig })
    ).rejects.toMatchObject({ code: 'payload_too_large', status: 413 })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (key: string) => (key === 'retry-after' ? '3' : null) },
        text: async () => 'rate limit',
      })
    )
    await expect(
      transcribeWithDeepgram({ blob, apiKey: 'bad', model: 'nova-3', providerConfig })
    ).rejects.toMatchObject({ code: 'rate_limited', status: 429, retryAfterMs: 3000 })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: async () => 'service down',
      })
    )
    await expect(
      transcribeWithDeepgram({ blob, apiKey: 'bad', model: 'nova-3', providerConfig })
    ).rejects.toMatchObject({ code: 'service_unavailable', status: 503 })
  })

  it('maps abort error from fetch', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    await expect(
      transcribeWithDeepgram({
        blob: new Blob(['audio']),
        apiKey: 'dg_test',
        model: 'nova-3',
        providerConfig: getAsrProviderConfig('deepgram'),
      })
    ).rejects.toMatchObject({ code: 'aborted' })
  })

  it('verifyDeepgramKey follows 200/401/other contract', async () => {
    const providerConfig = getAsrProviderConfig('deepgram')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null } })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => 'rate limited',
      })

    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyDeepgramKey({ apiKey: 'dg_ok', providerConfig })).resolves.toBe(true)
    await expect(verifyDeepgramKey({ apiKey: 'dg_bad', providerConfig })).resolves.toBe(false)
    await expect(verifyDeepgramKey({ apiKey: 'dg_err', providerConfig })).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
    })
  })
})

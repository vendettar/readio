import { describe, expect, it, vi } from 'vitest'
import {
  parseVolcengineCredentials,
  transcribeWithVolcengine,
  verifyVolcengineKey,
} from '../providers/volcengineCompatible'
import { getAsrProviderConfig } from '../registry'
import { ASRClientError } from '../types'

function volcHeaders(statusCode: string, logId = 'test-log-id') {
  return {
    get: (key: string) => {
      if (key === 'X-Api-Status-Code') return statusCode
      if (key === 'X-Tt-Logid') return logId
      return null
    },
  }
}

describe('Volcengine ASR Quick provider', () => {
  // -----------------------------------------------------------------------
  // Credential parser
  // -----------------------------------------------------------------------

  describe('credential parser', () => {
    it('parses valid appId:accessToken', () => {
      const result = parseVolcengineCredentials('myAppId:myAccessToken')
      expect(result).toEqual({ appId: 'myAppId', accessToken: 'myAccessToken' })
    })

    it('trims whitespace around credentials', () => {
      const result = parseVolcengineCredentials('  appId  :  token  ')
      expect(result).toEqual({ appId: 'appId', accessToken: 'token' })
    })

    it('rejects missing colon separator', () => {
      expect(() => parseVolcengineCredentials('no-colon-here')).toThrow(ASRClientError)
      expect(() => parseVolcengineCredentials('no-colon-here')).toThrow(/appId:accessToken/)
    })

    it('rejects empty appId (colon at start)', () => {
      expect(() => parseVolcengineCredentials(':accessToken')).toThrow(ASRClientError)
    })

    it('rejects empty accessToken (colon at end)', () => {
      expect(() => parseVolcengineCredentials('appId:')).toThrow(ASRClientError)
    })

    it('rejects whitespace-only appId', () => {
      expect(() => parseVolcengineCredentials('   :accessToken')).toThrow(ASRClientError)
    })

    it('rejects whitespace-only accessToken', () => {
      expect(() => parseVolcengineCredentials('appId:   ')).toThrow(ASRClientError)
    })
  })

  // -----------------------------------------------------------------------
  // Transcribe
  // -----------------------------------------------------------------------

  describe('transcribe', () => {
    it('throws unauthorized for invalid credential format', async () => {
      await expect(
        transcribeWithVolcengine({
          blob: new Blob(['audio']),
          apiKey: 'no-colon',
          model: 'bigmodel',
          providerConfig: getAsrProviderConfig('volcengine'),
        })
      ).rejects.toMatchObject({ code: 'unauthorized', status: 401 })
    })

    it('fails fast when blob exceeds 100MB limit', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const oversizedBlob = { size: 100 * 1024 * 1024 + 1 } as Blob

      await expect(
        transcribeWithVolcengine({
          blob: oversizedBlob,
          apiKey: 'app:token',
          model: 'bigmodel',
          providerConfig: getAsrProviderConfig('volcengine'),
        })
      ).rejects.toMatchObject({ code: 'payload_too_large', status: 413 })

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('parses successful response with utterances and word-level timestamps', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('20000000'),
          json: async () => ({
            audio_info: { duration: 2499 },
            result: {
              text: '关闭透传。',
              utterances: [
                {
                  start_time: 450,
                  end_time: 1530,
                  text: '关闭透传。',
                  words: [
                    { text: '关', start_time: 450, end_time: 770, confidence: 0 },
                    { text: '闭', start_time: 770, end_time: 970, confidence: 0 },
                    { text: '透', start_time: 1130, end_time: 1210, confidence: 0 },
                    { text: '传', start_time: 1490, end_time: 1530, confidence: 0 },
                  ],
                },
              ],
            },
          }),
        })
      )

      const result = await transcribeWithVolcengine({
        blob: new Blob(['audio'], { type: 'audio/mp3' }),
        apiKey: 'myAppId:myAccessToken',
        model: 'bigmodel',
        providerConfig: getAsrProviderConfig('volcengine'),
      })

      expect(result.provider).toBe('volcengine')
      expect(result.model).toBe('bigmodel')
      expect(result.durationSeconds).toBeCloseTo(2.499, 2)
      expect(result.cues).toHaveLength(1)
      expect(result.cues[0].text).toBe('关闭透传。')
      expect(result.cues[0].start).toBeCloseTo(0.45, 2)
      expect(result.cues[0].end).toBeCloseTo(1.53, 2)
      expect(result.cues[0].words).toHaveLength(4)
    })

    it('fills cue timestamps from words when utterance start/end are invalid', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('20000000'),
          json: async () => ({
            result: {
              text: 'hello world',
              utterances: [
                {
                  start_time: -1,
                  end_time: -1,
                  text: 'hello world',
                  words: [
                    { text: 'hello', start_time: 100, end_time: 550, confidence: 0 },
                    { text: 'world', start_time: 600, end_time: 1100, confidence: 0 },
                  ],
                },
              ],
            },
          }),
        })
      )

      const result = await transcribeWithVolcengine({
        blob: new Blob(['audio']),
        apiKey: 'app:token',
        model: 'bigmodel',
        providerConfig: getAsrProviderConfig('volcengine'),
      })

      expect(result.cues).toHaveLength(1)
      expect(result.cues[0].start).toBeCloseTo(0.1, 2)
      expect(result.cues[0].end).toBeCloseTo(1.1, 2)
    })

    it('normalizes cue end when end_time < start_time', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('20000000'),
          json: async () => ({
            result: {
              text: 'bad timing',
              utterances: [
                {
                  start_time: 3000,
                  end_time: 1000,
                  text: 'bad timing',
                  words: [],
                },
              ],
            },
          }),
        })
      )

      const result = await transcribeWithVolcengine({
        blob: new Blob(['audio']),
        apiKey: 'app:token',
        model: 'bigmodel',
        providerConfig: getAsrProviderConfig('volcengine'),
      })

      expect(result.cues).toHaveLength(1)
      expect(result.cues[0].start).toBeCloseTo(3, 2)
      expect(result.cues[0].end).toBeCloseTo(3, 2)
    })

    it('throws service_unavailable on empty transcript', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('20000000'),
          json: async () => ({
            result: { text: '', utterances: [] },
          }),
        })
      )

      await expect(
        transcribeWithVolcengine({
          blob: new Blob(['audio']),
          apiKey: 'app:token',
          model: 'bigmodel',
          providerConfig: getAsrProviderConfig('volcengine'),
        })
      ).rejects.toMatchObject({ code: 'service_unavailable' })
    })

    it('maps header 550* to service_unavailable when HTTP is 200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('55000031'),
          json: async () => ({}),
        })
      )

      await expect(
        transcribeWithVolcengine({
          blob: new Blob(['audio']),
          apiKey: 'app:token',
          model: 'bigmodel',
          providerConfig: getAsrProviderConfig('volcengine'),
        })
      ).rejects.toMatchObject({ code: 'service_unavailable' })
    })

    it('maps header 450* to client_error when HTTP is 200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('45000001'),
          json: async () => ({}),
        })
      )

      await expect(
        transcribeWithVolcengine({
          blob: new Blob(['audio']),
          apiKey: 'app:token',
          model: 'bigmodel',
          providerConfig: getAsrProviderConfig('volcengine'),
        })
      ).rejects.toMatchObject({ code: 'client_error' })
    })

    it('returns empty cues for silence status 20000003', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('20000003'),
          json: async () => ({ audio_info: { duration: 5000 }, result: { text: '' } }),
        })
      )

      const result = await transcribeWithVolcengine({
        blob: new Blob(['audio']),
        apiKey: 'app:token',
        model: 'bigmodel',
        providerConfig: getAsrProviderConfig('volcengine'),
      })

      expect(result.cues).toEqual([])
      expect(result.provider).toBe('volcengine')
    })

    it('throws service_unavailable when status header is missing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            result: {
              text: 'ok',
              utterances: [{ text: 'ok', start_time: 0, end_time: 500 }],
            },
          }),
        })
      )

      await expect(
        transcribeWithVolcengine({
          blob: new Blob(['audio']),
          apiKey: 'app:token',
          model: 'bigmodel',
          providerConfig: getAsrProviderConfig('volcengine'),
        })
      ).rejects.toMatchObject({ code: 'service_unavailable' })
    })

    it('sends correct headers and JSON body', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: volcHeaders('20000000'),
        json: async () => ({
          result: {
            text: 'ok',
            utterances: [{ text: 'ok', start_time: 0, end_time: 500 }],
          },
        }),
      })
      vi.stubGlobal('fetch', fetchMock)

      await transcribeWithVolcengine({
        blob: new Blob(['audio'], { type: 'audio/mp3' }),
        apiKey: 'myApp:myToken',
        model: 'bigmodel',
        providerConfig: getAsrProviderConfig('volcengine'),
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash')
      const headers = init.headers as Record<string, string>
      expect(headers['X-Api-App-Key']).toBe('myApp')
      expect(headers['X-Api-Access-Key']).toBe('myToken')
      expect(headers['X-Api-Resource-Id']).toBe('volc.bigasr.auc_turbo')
      expect(headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(init.body as string)
      expect(body.user.uid).toBe('myApp')
      expect(body.request.model_name).toBe('bigmodel')
      expect(typeof body.audio.data).toBe('string')
    })
  })

  // -----------------------------------------------------------------------
  // Verify key
  // -----------------------------------------------------------------------

  describe('verify key', () => {
    const providerConfig = getAsrProviderConfig('volcengine')

    it('returns true for status 20000000 (success)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('20000000'),
          json: async () => ({}),
        })
      )

      await expect(verifyVolcengineKey({ apiKey: 'app:token', providerConfig })).resolves.toBe(true)
    })

    it('returns true for status 20000003 (silence)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('20000003'),
          json: async () => ({}),
        })
      )

      await expect(verifyVolcengineKey({ apiKey: 'app:token', providerConfig })).resolves.toBe(true)
    })

    it('returns false for empty apiKey', async () => {
      await expect(verifyVolcengineKey({ apiKey: '', providerConfig })).resolves.toBe(false)
    })

    it('throws unauthorized for invalid credential format', async () => {
      await expect(
        verifyVolcengineKey({ apiKey: 'no-colon', providerConfig })
      ).rejects.toMatchObject({ code: 'unauthorized', status: 401 })
    })

    it('returns false for header 450*', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('45000001'),
        })
      )

      await expect(verifyVolcengineKey({ apiKey: 'app:token', providerConfig })).resolves.toBe(
        false
      )
    })

    it('throws service_unavailable for header 550*', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('55000031'),
        })
      )

      await expect(
        verifyVolcengineKey({ apiKey: 'app:token', providerConfig })
      ).rejects.toMatchObject({ code: 'service_unavailable' })
    })

    it('throws rate_limited for HTTP 429', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          headers: { get: () => null },
        })
      )

      await expect(
        verifyVolcengineKey({ apiKey: 'app:token', providerConfig })
      ).rejects.toMatchObject({ code: 'rate_limited', status: 429 })
    })

    it('throws service_unavailable for HTTP 503', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          headers: { get: () => null },
        })
      )

      await expect(
        verifyVolcengineKey({ apiKey: 'app:token', providerConfig })
      ).rejects.toMatchObject({ code: 'service_unavailable', status: 503 })
    })

    it('returns false for unknown status codes', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: volcHeaders('99999999'),
        })
      )

      await expect(verifyVolcengineKey({ apiKey: 'app:token', providerConfig })).resolves.toBe(
        false
      )
    })
  })
})

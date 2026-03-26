import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudioWithRetry } from '../../asr'
import * as openaiCompatible from '../../asr/providers/openaiCompatible'
import { ASRClientError } from '../../asr/types'

vi.mock('../../asr/mp3Chunker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../asr/mp3Chunker')>()
  return {
    ...actual,
    splitMp3Blob: vi.fn().mockImplementation((blob) => Promise.resolve([blob])),
    splitMp3BlobWithTargetSizes: vi.fn().mockImplementation((blob) => Promise.resolve([blob])),
  }
})

describe('ASR Retry Policy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('retries 429 once on short backoff', async () => {
    const error429 = new ASRClientError('Rate Limit', 'rate_limited', 429, 2000, 'generic')
    const successResult = {
      cues: [{ start: 0, end: 1, text: 'ok' }],
      provider: 'groq' as const,
      model: 'model',
      durationSeconds: 1,
    }

    const mockTranscribe = vi
      .spyOn(openaiCompatible, 'transcribeWithOpenAiCompatible')
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce(successResult)

    const req = transcribeAudioWithRetry({
      blob: new Blob([new ArrayBuffer(100)]),
      apiKey: 'key',
      provider: 'groq',
      model: 'model',
    })

    await vi.advanceTimersByTimeAsync(2000)
    await vi.runAllTimersAsync()
    const res = await req

    expect(res.cues[0].text).toBe('ok')
    expect(mockTranscribe).toHaveBeenCalledTimes(2)
  })

  it('does not retry 429 on long backoff (>15s)', async () => {
    const error429 = new ASRClientError('Rate Limit', 'rate_limited', 429, 20000, 'generic')

    vi.spyOn(openaiCompatible, 'transcribeWithOpenAiCompatible').mockRejectedValue(error429)

    await expect(
      transcribeAudioWithRetry({
        blob: new Blob([new ArrayBuffer(100)]),
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
      })
    ).rejects.toThrowError('Rate Limit')
  })

  it('retries 5xx once for small chunks', async () => {
    const error500 = new ASRClientError('Server Error', 'service_unavailable', 500)
    const successResult = {
      cues: [{ start: 0, end: 1, text: 'ok' }],
      provider: 'groq' as const,
      model: 'model',
      durationSeconds: 1,
    }

    const mockTranscribe = vi
      .spyOn(openaiCompatible, 'transcribeWithOpenAiCompatible')
      .mockRejectedValueOnce(error500)
      .mockResolvedValueOnce(successResult)

    const req = transcribeAudioWithRetry({
      blob: new Blob([new ArrayBuffer(100)]), // 100 bytes is a small chunk
      expectedDurationSeconds: 10, // Small expected duration
      apiKey: 'key',
      provider: 'groq',
      model: 'model',
    })

    await vi.advanceTimersByTimeAsync(3000)
    await vi.runAllTimersAsync()
    const res = await req

    expect(res.cues[0].text).toBe('ok')
    expect(mockTranscribe).toHaveBeenCalledTimes(2)
  })

  it('does not retry 5xx for large chunks (>600s)', async () => {
    const error500 = new ASRClientError('Server Error', 'service_unavailable', 500)

    const mockTranscribe = vi
      .spyOn(openaiCompatible, 'transcribeWithOpenAiCompatible')
      .mockRejectedValue(error500)

    await expect(
      transcribeAudioWithRetry({
        blob: new Blob([new ArrayBuffer(100)]),
        expectedDurationSeconds: 1200, // Large expected duration (>600s)
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
      })
    ).rejects.toThrowError('Server Error')

    expect(mockTranscribe).toHaveBeenCalledTimes(1)
  })

  it('immediately fails on retryAfterMs > 60000 regardless of code', async () => {
    const extremeWait = new ASRClientError(
      'Wait an hour',
      'service_unavailable',
      503,
      61 * 60 * 1000
    )
    vi.spyOn(openaiCompatible, 'transcribeWithOpenAiCompatible').mockRejectedValue(extremeWait)

    await expect(
      transcribeAudioWithRetry({
        blob: new Blob([new ArrayBuffer(100)]),
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
      })
    ).rejects.toThrowError('Wait an hour')
  })

  it('throws ASRClientError(aborted) if aborted during backoff', async () => {
    const error429 = new ASRClientError('Rate Limit', 'rate_limited', 429, 2000, 'generic')
    const mockTranscribe = vi
      .spyOn(openaiCompatible, 'transcribeWithOpenAiCompatible')
      .mockRejectedValue(error429)

    const controller = new AbortController()

    const req = transcribeAudioWithRetry({
      blob: new Blob([new ArrayBuffer(100)]),
      apiKey: 'key',
      provider: 'groq',
      model: 'model',
      signal: controller.signal,
    })

    // Set up the expectation before timers run to catch the rejection
    const expectPromise = expect(req).rejects.toMatchObject({
      code: 'aborted',
    })

    // Advance just enough to trigger the first failure and enter backoff
    await vi.advanceTimersByTimeAsync(10)

    // Abort while waiting in sleepWithAbort
    controller.abort()

    // Advance remainder to resolve the sleep
    await vi.advanceTimersByTimeAsync(2000)
    await vi.runAllTimersAsync()

    await expectPromise

    expect(mockTranscribe).toHaveBeenCalledTimes(1)
  })
})

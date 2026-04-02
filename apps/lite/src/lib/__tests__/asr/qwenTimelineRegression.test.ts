import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudioWithRetry } from '../../asr'
import * as mp3Chunker from '../../asr/mp3Chunker'
import * as providers from '../../asr/providers/qwenCompatible'
import type { ASRProvider } from '../../asr/types'

vi.mock('../../asr/mp3Chunker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../asr/mp3Chunker')>()
  return {
    ...actual,
    splitMp3Blob: vi.fn(),
    splitMp3BlobWithTargetSizes: vi.fn(),
  }
})

vi.mock('../../asr/providers/qwenCompatible', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../asr/providers/qwenCompatible')>()
  return {
    ...actual,
    transcribeWithQwen: vi.fn(),
  }
})

describe('Qwen Timeline Regression', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // TODO: Re-enable Qwen regression tests once Qwen provider is stabilized and restriction is lifted.
  it.skip('ensures monotonic increasing timestamps when Qwen returns 0-end cues in multi-chunk mode', async () => {
    // 1. Setup multi-chunk scenario
    // 200 bytes total, 2 chunks of 100 bytes
    const totalBlob = new Blob([new ArrayBuffer(200)], { type: 'audio/mpeg' })
    const chunk1 = new Blob([new ArrayBuffer(100)], { type: 'audio/mpeg' })
    const chunk2 = new Blob([new ArrayBuffer(100)], { type: 'audio/mpeg' })

    vi.spyOn(mp3Chunker, 'splitMp3BlobWithTargetSizes').mockResolvedValue([chunk1, chunk2])

    // 2. Mock Qwen to return "Instruction 125b" style zero-duration cues
    // This simulates the behavior where Qwen only returns text and we produce a cue spanning [0, 0]
    const mockTranscribe = vi
      .spyOn(providers, 'transcribeWithQwen')
      .mockResolvedValueOnce({
        cues: [{ start: 0, end: 0, text: 'Hello' }],
        provider: 'qwen' as ASRProvider,
        model: 'qwen-asr',
      })
      .mockResolvedValueOnce({
        cues: [{ start: 0, end: 0, text: 'World' }],
        provider: 'qwen' as ASRProvider,
        model: 'qwen-asr',
      })

    // 3. Run transcription with expected total duration
    const result = await transcribeAudioWithRetry({
      blob: totalBlob,
      apiKey: 'test-key',
      provider: 'qwen' as ASRProvider,
      model: 'qwen-asr',
      expectedDurationSeconds: 20, // 200 bytes, so each 100-byte chunk should be 10s
    })

    // 4. Assertions
    expect(mockTranscribe).toHaveBeenCalledTimes(2)

    // Total duration should be 20s
    expect(result.durationSeconds).toBe(20)

    // Cues should be patched and merged correctly
    expect(result.cues).toHaveLength(2)

    // First cue: [0, 10]
    expect(result.cues[0].start).toBe(0)
    expect(result.cues[0].end).toBe(10)
    expect(result.cues[0].text).toBe('Hello')

    // Second cue: [10, 20]
    expect(result.cues[1].start).toBe(10)
    expect(result.cues[1].end).toBe(20)
    expect(result.cues[1].text).toBe('World')

    // Verify monotonicity
    expect(result.cues[1].start).toBeGreaterThanOrEqual(result.cues[0].end)
  })
})

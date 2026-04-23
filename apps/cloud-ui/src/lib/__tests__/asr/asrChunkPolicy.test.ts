import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ABSOLUTE_MAX_CALLS, transcribeAudioWithRetry } from '../../asr'
import * as backendRelay from '../../asr/backendRelay'
import * as chunker from '../../asr/mp3Chunker'

vi.mock('../../asr/registry', () => ({
  getAsrProviderConfig: () => ({ transport: 'mock' }),
}))

vi.mock('../../asr/backendRelay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../asr/backendRelay')>()
  return {
    ...actual,
    transcribeViaCloudRelay: vi.fn(),
  }
})

function createLikelyMp3Bytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes[0] = 0xff
  bytes[1] = 0xfb
  bytes[2] = 0x90
  bytes[3] = 0x64
  return bytes
}

function createProbeableBlob(bytes: Uint8Array, type = 'application/octet-stream'): Blob {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer

  return {
    size: bytes.byteLength,
    type,
    slice(start?: number, end?: number): Blob {
      const s = Math.max(0, start ?? 0)
      const e = Math.min(bytes.byteLength, end ?? bytes.byteLength)
      const sliced = bytes.slice(s, e)
      const slicedBuffer = sliced.buffer.slice(
        sliced.byteOffset,
        sliced.byteOffset + sliced.byteLength
      ) as ArrayBuffer

      return {
        size: sliced.byteLength,
        type,
        arrayBuffer: async () => slicedBuffer,
      } as unknown as Blob
    },
    arrayBuffer: async () => arrayBuffer,
  } as unknown as Blob
}

describe('ASR Chunk Policy', () => {
  let splitBaselineSpy: ReturnType<typeof vi.spyOn>
  let splitProgressiveSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    splitBaselineSpy = vi.spyOn(chunker, 'splitMp3Blob').mockResolvedValue([new Blob()])
    splitProgressiveSpy = vi
      .spyOn(chunker, 'splitMp3BlobWithTargetSizes')
      .mockResolvedValue([new Blob()])
    vi.spyOn(backendRelay, 'transcribeViaCloudRelay').mockResolvedValue({
      cues: [{ start: 0, end: 1, text: 'ok' }],
      provider: 'groq',
      model: 'model',
      durationSeconds: 1,
    })
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('splits blob at global byte limit without expectedDuration', async () => {
    const blob = new Blob([new ArrayBuffer(100)])
    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
      })
    } catch {}

    expect(splitBaselineSpy).toHaveBeenCalledWith(blob, 10 * 1024 * 1024)
    expect(splitProgressiveSpy).not.toHaveBeenCalled()
  })

  it('uses progressive chunk targets when duration is valid and source is MP3', async () => {
    const blob = new Blob([new ArrayBuffer(10 * 1024 * 1024)], { type: 'audio/mpeg' }) // 10MB
    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds: 1200, // 20 mins
      })
    } catch {}

    expect(splitProgressiveSpy).toHaveBeenCalledTimes(1)
    const [, targetSizes] = splitProgressiveSpy.mock.calls[0]
    expect(targetSizes[0]).toBe(43690) // 5s
    expect(targetSizes[1]).toBe(87381) // 10s
    expect(splitBaselineSpy).not.toHaveBeenCalled()
  })

  it('uses short-audio bypass as single progressive target (<=90s)', async () => {
    const blob = new Blob([new ArrayBuffer(6 * 1024 * 1024)], { type: 'audio/mpeg' })
    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds: 60,
      })
    } catch {}

    expect(splitProgressiveSpy).toHaveBeenCalledTimes(1)
    const [, targetSizes] = splitProgressiveSpy.mock.calls[0]
    expect(targetSizes).toHaveLength(1)
    expect(splitBaselineSpy).not.toHaveBeenCalled()
  })

  it('uses progressive chunk targets for generic mime when MP3 frame header is detected', async () => {
    const blob = createProbeableBlob(createLikelyMp3Bytes(10 * 1024))
    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds: 1200,
      })
    } catch {}

    expect(splitProgressiveSpy).toHaveBeenCalledTimes(1)
    expect(splitBaselineSpy).not.toHaveBeenCalled()
  })

  it('falls back to baseline policy for generic mime without MP3 frame header', async () => {
    const blob = createProbeableBlob(new Uint8Array(10 * 1024))
    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds: 1200,
      })
    } catch {}

    expect(splitProgressiveSpy).not.toHaveBeenCalled()
    expect(splitBaselineSpy).toHaveBeenCalledTimes(1)
  })

  it('skips progressive chunking when preferProgressive is false', async () => {
    const blob = new Blob([new ArrayBuffer(10 * 1024 * 1024)], { type: 'audio/mpeg' })
    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds: 1200,
        preferProgressive: false,
      })
    } catch {}

    expect(splitProgressiveSpy).not.toHaveBeenCalled()
    expect(splitBaselineSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith(
      '[asr] progressive chunk plan skipped',
      expect.objectContaining({
        reason: 'progressive_disabled',
      })
    )
  })

  it('falls back to baseline policy when baseline exceeds absolute call cap', async () => {
    const blob = new Blob([new ArrayBuffer(1024)], { type: 'audio/mpeg' })
    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds: 15001,
      })
    } catch {}

    expect(splitProgressiveSpy).not.toHaveBeenCalled()
    const expectedBaselineSize = Math.floor((blob.size / 15001) * 600)
    expect(splitBaselineSpy).toHaveBeenCalledWith(blob, expectedBaselineSize)
  })

  it('falls back to baseline policy when baseline reaches absolute call cap', async () => {
    const blob = new Blob([new ArrayBuffer(1024)], { type: 'audio/mpeg' })
    const expectedDurationSeconds = 600 * 24
    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds,
      })
    } catch {}

    expect(splitProgressiveSpy).not.toHaveBeenCalled()
    const expectedBaselineSize = Math.floor((blob.size / expectedDurationSeconds) * 600)
    expect(splitBaselineSpy).toHaveBeenCalledWith(blob, expectedBaselineSize)
  })

  it('fails fast when fallback baseline split exceeds absolute call cap', async () => {
    const blob = new Blob([new ArrayBuffer(1024)])
    splitBaselineSpy.mockResolvedValueOnce(
      Array.from({ length: ABSOLUTE_MAX_CALLS + 1 }, () => new Blob())
    )

    await expect(
      transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
      })
    ).rejects.toMatchObject({
      code: 'file_too_large',
    })
  })

  it('retries progressive split once with scaled targets and keeps progressive when convergence succeeds', async () => {
    const blob = new Blob([new ArrayBuffer(10 * 1024 * 1024)], { type: 'audio/mpeg' })
    splitProgressiveSpy
      .mockResolvedValueOnce(Array.from({ length: 5 }, () => new Blob()))
      .mockResolvedValueOnce(Array.from({ length: 4 }, () => new Blob()))

    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds: 1200,
      })
    } catch {}

    expect(splitProgressiveSpy).toHaveBeenCalledTimes(2)
    const [, firstTargets] = splitProgressiveSpy.mock.calls[0]
    const [, secondTargets] = splitProgressiveSpy.mock.calls[1]
    expect(secondTargets[0]).toBeGreaterThan(firstTargets[0])
    expect(splitBaselineSpy).not.toHaveBeenCalled()
  })

  it('falls back to baseline only if retry split still exceeds hard budget', async () => {
    const blob = new Blob([new ArrayBuffer(10 * 1024 * 1024)], { type: 'audio/mpeg' })
    splitProgressiveSpy
      .mockResolvedValueOnce(Array.from({ length: 5 }, () => new Blob()))
      .mockResolvedValueOnce(Array.from({ length: 5 }, () => new Blob()))

    try {
      await transcribeAudioWithRetry({
        blob,
        apiKey: 'key',
        provider: 'groq',
        model: 'model',
        expectedDurationSeconds: 1200,
      })
    } catch {}

    expect(splitProgressiveSpy).toHaveBeenCalledTimes(2)
    expect(splitBaselineSpy).toHaveBeenCalledWith(blob, 5242880)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudioWithRetry, verifyAsrKey } from '..'

const splitMp3BlobMock = vi.hoisted(() => vi.fn())
const splitMp3BlobWithTargetSizesMock = vi.hoisted(() => vi.fn())
const transcribeWithOpenAiCompatibleMock = vi.hoisted(() => vi.fn())
const verifyOpenAiCompatibleKeyMock = vi.hoisted(() => vi.fn())
const transcribeWithQwenMock = vi.hoisted(() => vi.fn())
const verifyQwenKeyMock = vi.hoisted(() => vi.fn())
const transcribeWithDeepgramMock = vi.hoisted(() => vi.fn())
const verifyDeepgramKeyMock = vi.hoisted(() => vi.fn())

vi.mock('../mp3Chunker', () => ({
  splitMp3Blob: (...args: unknown[]) => splitMp3BlobMock(...args),
  splitMp3BlobWithTargetSizes: (...args: unknown[]) => splitMp3BlobWithTargetSizesMock(...args),
  mergeAsrCues: (cuesList: Array<Array<{ start: number; end: number; text: string }>>) =>
    cuesList.flat(),
}))

vi.mock('../providers/openaiCompatible', async () => {
  const actual = await vi.importActual<typeof import('../providers/openaiCompatible')>(
    '../providers/openaiCompatible'
  )
  return {
    ...actual,
    transcribeWithOpenAiCompatible: (...args: unknown[]) =>
      transcribeWithOpenAiCompatibleMock(...args),
    verifyOpenAiCompatibleKey: (...args: unknown[]) => verifyOpenAiCompatibleKeyMock(...args),
  }
})

vi.mock('../providers/qwenCompatible', async () => {
  const actual = await vi.importActual<typeof import('../providers/qwenCompatible')>(
    '../providers/qwenCompatible'
  )
  return {
    ...actual,
    transcribeWithQwen: (...args: unknown[]) => transcribeWithQwenMock(...args),
    verifyQwenKey: (...args: unknown[]) => verifyQwenKeyMock(...args),
  }
})

vi.mock('../providers/deepgramCompatible', async () => {
  const actual = await vi.importActual<typeof import('../providers/deepgramCompatible')>(
    '../providers/deepgramCompatible'
  )
  return {
    ...actual,
    transcribeWithDeepgram: (...args: unknown[]) => transcribeWithDeepgramMock(...args),
    verifyDeepgramKey: (...args: unknown[]) => verifyDeepgramKeyMock(...args),
  }
})

describe('ASR index deepgram transport routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes deepgram provider to transcribeWithDeepgram only', async () => {
    const chunk = new Blob(['audio'], { type: 'audio/mpeg' })
    splitMp3BlobMock.mockResolvedValue([chunk])
    splitMp3BlobWithTargetSizesMock.mockResolvedValue([chunk])
    transcribeWithDeepgramMock.mockResolvedValue({
      cues: [{ start: 0, end: 1.2, text: 'deepgram text' }],
      durationSeconds: 1.2,
      provider: 'deepgram',
      model: 'nova-3',
    })
    transcribeWithOpenAiCompatibleMock.mockResolvedValue({
      cues: [{ start: 0, end: 1.2, text: 'openai text' }],
      durationSeconds: 1.2,
      provider: 'groq',
      model: 'whisper-large-v3',
    })
    transcribeWithQwenMock.mockResolvedValue({
      cues: [{ start: 0, end: 0, text: 'qwen text' }],
      provider: 'qwen',
      model: 'qwen3-asr-flash',
    })

    const result = await transcribeAudioWithRetry({
      blob: chunk,
      apiKey: 'dg_key',
      provider: 'deepgram',
      model: 'nova-3',
      preferProgressive: false,
    })

    expect(transcribeWithDeepgramMock).toHaveBeenCalledTimes(1)
    expect(transcribeWithOpenAiCompatibleMock).not.toHaveBeenCalled()
    expect(transcribeWithQwenMock).not.toHaveBeenCalled()
    expect(result.provider).toBe('deepgram')
  })

  it('routes verifyAsrKey deepgram provider to verifyDeepgramKey only', async () => {
    verifyDeepgramKeyMock.mockResolvedValue(true)
    verifyOpenAiCompatibleKeyMock.mockResolvedValue(true)
    verifyQwenKeyMock.mockResolvedValue(true)

    await expect(verifyAsrKey({ apiKey: 'dg_key', provider: 'deepgram' })).resolves.toBe(true)
    expect(verifyDeepgramKeyMock).toHaveBeenCalledTimes(1)
    expect(verifyOpenAiCompatibleKeyMock).not.toHaveBeenCalled()
    expect(verifyQwenKeyMock).not.toHaveBeenCalled()
  })

  it('keeps non-deepgram providers off deepgram transport', async () => {
    const chunk = new Blob(['audio'], { type: 'audio/mpeg' })
    splitMp3BlobMock.mockResolvedValue([chunk])
    transcribeWithOpenAiCompatibleMock.mockResolvedValue({
      cues: [{ start: 0, end: 1.1, text: 'openai text' }],
      durationSeconds: 1.1,
      provider: 'groq',
      model: 'whisper-large-v3',
    })
    verifyQwenKeyMock.mockResolvedValue(true)

    await transcribeAudioWithRetry({
      blob: chunk,
      apiKey: 'gsk_key',
      provider: 'groq',
      model: 'whisper-large-v3',
      preferProgressive: false,
    })
    await verifyAsrKey({ apiKey: 'qwen_key', provider: 'qwen' })

    expect(transcribeWithOpenAiCompatibleMock).toHaveBeenCalledTimes(1)
    expect(verifyQwenKeyMock).toHaveBeenCalledTimes(1)
    expect(transcribeWithDeepgramMock).not.toHaveBeenCalled()
    expect(verifyDeepgramKeyMock).not.toHaveBeenCalled()
  })
})

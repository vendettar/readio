import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudioWithRetry, verifyAsrKey } from '..'

const splitMp3BlobMock = vi.hoisted(() => vi.fn())
const splitMp3BlobWithTargetSizesMock = vi.hoisted(() => vi.fn())
const transcribeViaCloudRelayMock = vi.hoisted(() => vi.fn())
const verifyAsrKeyViaCloudRelayMock = vi.hoisted(() => vi.fn())
const transcribeWithOpenAiCompatibleMock = vi.hoisted(() => vi.fn())
const transcribeWithQwenMock = vi.hoisted(() => vi.fn())
const transcribeWithDeepgramMock = vi.hoisted(() => vi.fn())

vi.mock('../mp3Chunker', () => ({
  splitMp3Blob: (...args: unknown[]) => splitMp3BlobMock(...args),
  splitMp3BlobWithTargetSizes: (...args: unknown[]) => splitMp3BlobWithTargetSizesMock(...args),
  mergeAsrCues: (cuesList: Array<Array<{ start: number; end: number; text: string }>>) =>
    cuesList.flat(),
}))

vi.mock('../backendRelay', () => ({
  transcribeViaCloudRelay: (...args: unknown[]) => transcribeViaCloudRelayMock(...args),
  verifyAsrKeyViaCloudRelay: (...args: unknown[]) => verifyAsrKeyViaCloudRelayMock(...args),
}))

vi.mock('../providers/openaiCompatible', async () => {
  const actual = await vi.importActual<typeof import('../providers/openaiCompatible')>(
    '../providers/openaiCompatible'
  )
  return {
    ...actual,
    transcribeWithOpenAiCompatible: (...args: unknown[]) =>
      transcribeWithOpenAiCompatibleMock(...args),
  }
})

vi.mock('../providers/qwenCompatible', async () => {
  const actual = await vi.importActual<typeof import('../providers/qwenCompatible')>(
    '../providers/qwenCompatible'
  )
  return {
    ...actual,
    transcribeWithQwen: (...args: unknown[]) => transcribeWithQwenMock(...args),
  }
})

vi.mock('../providers/deepgramCompatible', async () => {
  const actual = await vi.importActual<typeof import('../providers/deepgramCompatible')>(
    '../providers/deepgramCompatible'
  )
  return {
    ...actual,
    transcribeWithDeepgram: (...args: unknown[]) => transcribeWithDeepgramMock(...args),
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
    transcribeViaCloudRelayMock.mockResolvedValue({
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

    expect(transcribeViaCloudRelayMock).toHaveBeenCalledTimes(1)
    expect(transcribeWithOpenAiCompatibleMock).not.toHaveBeenCalled()
    expect(transcribeWithDeepgramMock).not.toHaveBeenCalled()
    expect(transcribeWithQwenMock).not.toHaveBeenCalled()
    expect(result.provider).toBe('deepgram')
  })

  it('routes verifyAsrKey deepgram provider to same-origin relay only', async () => {
    verifyAsrKeyViaCloudRelayMock.mockResolvedValue(true)

    await expect(verifyAsrKey({ apiKey: 'dg_key', provider: 'deepgram' })).resolves.toBe(true)
    expect(verifyAsrKeyViaCloudRelayMock).toHaveBeenCalledTimes(1)
  })

  it('keeps non-deepgram providers off deepgram transport', async () => {
    const chunk = new Blob(['audio'], { type: 'audio/mpeg' })
    splitMp3BlobMock.mockResolvedValue([chunk])
    transcribeViaCloudRelayMock.mockResolvedValue({
      cues: [{ start: 0, end: 1.1, text: 'openai text' }],
      durationSeconds: 1.1,
      provider: 'groq',
      model: 'whisper-large-v3',
    })
    verifyAsrKeyViaCloudRelayMock.mockResolvedValue(true)

    await transcribeAudioWithRetry({
      blob: chunk,
      apiKey: 'gsk_key',
      provider: 'groq',
      model: 'whisper-large-v3',
      preferProgressive: false,
    })
    await verifyAsrKey({ apiKey: 'qwen_key', provider: 'qwen' })

    expect(transcribeViaCloudRelayMock).toHaveBeenCalledTimes(1)
    expect(transcribeWithOpenAiCompatibleMock).not.toHaveBeenCalled()
    expect(verifyAsrKeyViaCloudRelayMock).toHaveBeenCalledTimes(1)
    expect(transcribeWithDeepgramMock).not.toHaveBeenCalled()
  })
})

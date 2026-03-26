import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudioWithRetry, verifyAsrKey } from '..'

const splitMp3BlobMock = vi.hoisted(() => vi.fn())
const splitMp3BlobWithTargetSizesMock = vi.hoisted(() => vi.fn())
const transcribeWithDeepgramMock = vi.hoisted(() => vi.fn())
const verifyDeepgramKeyMock = vi.hoisted(() => vi.fn())
const isAsrProviderEnabledMock = vi.hoisted(() => vi.fn())

vi.mock('../mp3Chunker', () => ({
  splitMp3Blob: (...args: unknown[]) => splitMp3BlobMock(...args),
  splitMp3BlobWithTargetSizes: (...args: unknown[]) => splitMp3BlobWithTargetSizesMock(...args),
  mergeAsrCues: (cuesList: Array<Array<{ start: number; end: number; text: string }>>) =>
    cuesList.flat(),
}))

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

vi.mock('../providerToggles', () => ({
  isAsrProviderEnabled: (...args: unknown[]) => isAsrProviderEnabledMock(...args),
  resolveEnabledAsrProviders: vi.fn(),
}))

describe('ASR runtime provider toggle guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isAsrProviderEnabledMock.mockReturnValue(true)
  })

  it('fails closed before transcribe network path when provider is disabled', async () => {
    isAsrProviderEnabledMock.mockReturnValue(false)

    await expect(
      transcribeAudioWithRetry({
        blob: new Blob(['audio'], { type: 'audio/mpeg' }),
        apiKey: 'dg_key',
        provider: 'deepgram',
        model: 'nova-3',
      })
    ).rejects.toMatchObject({
      code: 'client_error',
      message: 'ASR provider disabled by runtime config',
    })

    expect(splitMp3BlobMock).not.toHaveBeenCalled()
    expect(splitMp3BlobWithTargetSizesMock).not.toHaveBeenCalled()
    expect(transcribeWithDeepgramMock).not.toHaveBeenCalled()
  })

  it('fails closed before verify network path when provider is disabled', async () => {
    isAsrProviderEnabledMock.mockReturnValue(false)

    await expect(verifyAsrKey({ apiKey: 'dg_key', provider: 'deepgram' })).rejects.toMatchObject({
      code: 'client_error',
      message: 'ASR provider disabled by runtime config',
    })

    expect(verifyDeepgramKeyMock).not.toHaveBeenCalled()
  })

  it('keeps enabled provider path unchanged', async () => {
    const chunk = new Blob(['audio'], { type: 'audio/mpeg' })
    splitMp3BlobMock.mockResolvedValue([chunk])
    transcribeWithDeepgramMock.mockResolvedValue({
      cues: [{ start: 0, end: 1.2, text: 'deepgram text' }],
      durationSeconds: 1.2,
      provider: 'deepgram',
      model: 'nova-3',
    })
    verifyDeepgramKeyMock.mockResolvedValue(true)

    const transcribeResult = await transcribeAudioWithRetry({
      blob: chunk,
      apiKey: 'dg_key',
      provider: 'deepgram',
      model: 'nova-3',
      preferProgressive: false,
    })
    const verifyResult = await verifyAsrKey({ apiKey: 'dg_key', provider: 'deepgram' })

    expect(transcribeResult.provider).toBe('deepgram')
    expect(verifyResult).toBe(true)
    expect(transcribeWithDeepgramMock).toHaveBeenCalledTimes(1)
    expect(verifyDeepgramKeyMock).toHaveBeenCalledTimes(1)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processSelectedFiles } from '../fileHandlerService'
import { toast } from '../toast'

vi.mock('../logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('../toast', () => ({
  toast: {
    errorKey: vi.fn(),
    warningKey: vi.fn(),
    infoKey: vi.fn(),
  },
}))

describe('fileHandlerService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('loads audio files through provided action', async () => {
    const loadAudio = vi.fn(async () => {})
    const loadSubtitles = vi.fn(async () => {})

    await processSelectedFiles([new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })], {
      loadAudio,
      loadSubtitles,
    })

    expect(loadAudio).toHaveBeenCalledTimes(1)
    expect(loadSubtitles).not.toHaveBeenCalled()
  })

  it('loads subtitle files through provided action', async () => {
    const loadAudio = vi.fn(async () => {})
    const loadSubtitles = vi.fn(async () => {})

    await processSelectedFiles([new File(['sub'], 'test.srt')], {
      loadAudio,
      loadSubtitles,
    })

    expect(loadSubtitles).toHaveBeenCalledTimes(1)
    expect(loadAudio).not.toHaveBeenCalled()
  })

  it('reports unsupported files', async () => {
    await processSelectedFiles([new File(['text'], 'readme.txt')], {
      loadAudio: vi.fn(async () => {}),
      loadSubtitles: vi.fn(async () => {}),
    })

    expect(toast.errorKey).toHaveBeenCalledWith('toastFileValidationError')
  })
})

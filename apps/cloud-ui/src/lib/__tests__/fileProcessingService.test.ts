import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FILE_PROCESSING_RESULT,
  processDroppedFiles,
  processSelectedAudioFiles,
  processSelectedSubtitleFile,
} from '../fileProcessingService'
import { attachSubtitleToTrack, ingestFiles } from '../files/ingest'
import { checkStorageQuota, evaluateUploadGuardrails } from '../storageQuota'
import { toast } from '../toast'

vi.mock('../files/ingest', () => ({
  ingestFiles: vi.fn(),
  attachSubtitleToTrack: vi.fn(),
}))

vi.mock('../storageQuota', () => ({
  evaluateUploadGuardrails: vi.fn(),
  checkStorageQuota: vi.fn(),
}))

vi.mock('../toast', () => ({
  toast: {
    errorKey: vi.fn(),
  },
}))

describe('fileProcessingService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(evaluateUploadGuardrails).mockResolvedValue({ blocked: false })
  })

  it('processes dropped files through ingest and rechecks quota', async () => {
    const file = new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' })

    const result = await processDroppedFiles([file], 'folder-1')

    expect(ingestFiles).toHaveBeenCalledWith({
      files: [file],
      folderId: 'folder-1',
    })
    expect(checkStorageQuota).toHaveBeenCalledWith({ mode: 'silent' })
    expect(result).toBe(FILE_PROCESSING_RESULT.PROCESSED)
  })

  it('rejects selected audio input when no audio file is present', async () => {
    const result = await processSelectedAudioFiles([new File(['srt'], 'episode.srt')], null)

    expect(ingestFiles).not.toHaveBeenCalled()
    expect(toast.errorKey).toHaveBeenCalledWith('validationInvalidAudioFormat')
    expect(result).toBe(FILE_PROCESSING_RESULT.IGNORED)
  })

  it('blocks selected audio input when guardrail blocks upload', async () => {
    vi.mocked(evaluateUploadGuardrails).mockResolvedValueOnce({ blocked: true })
    const file = new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' })

    const result = await processSelectedAudioFiles([file], null)

    expect(ingestFiles).not.toHaveBeenCalled()
    expect(result).toBe(FILE_PROCESSING_RESULT.BLOCKED)
  })

  it('attaches subtitle through ingest module and rechecks quota', async () => {
    const subtitle = new File(['sub'], 'episode.srt')

    const result = await processSelectedSubtitleFile([subtitle], 'track-1')

    expect(attachSubtitleToTrack).toHaveBeenCalledWith(subtitle, 'track-1')
    expect(checkStorageQuota).toHaveBeenCalledWith({ mode: 'silent' })
    expect(result).toBe(FILE_PROCESSING_RESULT.PROCESSED)
  })

  it('ignores subtitle processing when no target track exists', async () => {
    const result = await processSelectedSubtitleFile([new File(['sub'], 'episode.srt')], null)

    expect(attachSubtitleToTrack).not.toHaveBeenCalled()
    expect(result).toBe(FILE_PROCESSING_RESULT.IGNORED)
  })
})

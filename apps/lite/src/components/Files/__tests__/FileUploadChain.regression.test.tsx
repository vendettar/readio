import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileHandler } from '../../../hooks/useFileHandler'
import { toast } from '../../../lib/toast'
import { usePlayerStore } from '../../../store/playerStore'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { FileDropZone } from '../FileDropZone'

const { evaluateUploadGuardrailsMock, checkStorageQuotaMock } = vi.hoisted(() => ({
  evaluateUploadGuardrailsMock: vi.fn(async () => ({ blocked: false })),
  checkStorageQuotaMock: vi.fn(async () => {}),
}))
let dropHandler: ((acceptedFiles: File[], rejectedFiles: unknown[]) => void) | undefined

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  }
})

vi.mock('react-dropzone', () => ({
  useDropzone: (options: { onDrop: (acceptedFiles: File[], rejectedFiles: unknown[]) => void }) => {
    dropHandler = options.onDrop
    return {
      getRootProps: () => ({}),
      getInputProps: () => ({}),
      isDragActive: false,
    }
  },
}))

vi.mock('../../../lib/logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('../../../lib/toast', () => ({
  toast: {
    errorKey: vi.fn(),
    warningKey: vi.fn(),
    infoKey: vi.fn(),
  },
}))

vi.mock('../../../lib/storageQuota', () => ({
  evaluateUploadGuardrails: evaluateUploadGuardrailsMock,
  checkStorageQuota: checkStorageQuotaMock,
}))

function UploadChainHarness() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { handleFileChange } = useFileHandler()

  return (
    <>
      <input ref={inputRef} data-testid="upload-input" />
      <FileDropZone
        onFilesAccepted={(files) => {
          const input = inputRef.current
          if (!input) return

          Object.defineProperty(input, 'files', {
            configurable: true,
            value: files,
          })
          input.value = 'selected'

          handleFileChange({
            currentTarget: input,
            target: input,
          } as unknown as Parameters<typeof handleFileChange>[0])
        }}
      >
        <div>dropzone</div>
      </FileDropZone>
    </>
  )
}

describe('File upload chain regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dropHandler = undefined
    sessionStorage.clear()
    usePlayerStore.setState({
      audioLoaded: false,
      loadAudio: vi.fn().mockResolvedValue(undefined),
      loadSubtitles: vi.fn().mockResolvedValue(undefined),
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
    })
  })

  it('processes repeated first-file drops without needing page reload', async () => {
    const file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' })
    const loadAudio = usePlayerStore.getState().loadAudio as ReturnType<typeof vi.fn>

    render(<UploadChainHarness />)
    expect(dropHandler).toBeDefined()

    await act(async () => {
      dropHandler?.([file], [])
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      dropHandler?.([file], [])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadAudio).toHaveBeenCalledTimes(2)
    expect(evaluateUploadGuardrailsMock).toHaveBeenCalledTimes(2)
    expect(checkStorageQuotaMock).toHaveBeenCalledTimes(2)
    expect(toast.errorKey).not.toHaveBeenCalledWith('toastUploadFailed')
  })
})

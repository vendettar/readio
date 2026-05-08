import { attachSubtitleToTrack, ingestFiles } from './files/ingest'
import { isValidAudioFile } from './schemas/files'
import { checkStorageQuota, evaluateUploadGuardrails } from './storageQuota'
import { toast } from './toast'

export const FILE_PROCESSING_RESULT = {
  PROCESSED: 'processed',
  BLOCKED: 'blocked',
  IGNORED: 'ignored',
} as const

export type FileProcessingResult =
  (typeof FILE_PROCESSING_RESULT)[keyof typeof FILE_PROCESSING_RESULT]

export async function processDroppedFiles(
  files: File[],
  folderId: string | null
): Promise<FileProcessingResult> {
  const { blocked } = await evaluateUploadGuardrails(files)
  if (blocked) {
    return FILE_PROCESSING_RESULT.BLOCKED
  }

  await ingestFiles({
    files,
    folderId,
  })
  void checkStorageQuota({ mode: 'silent' })
  return FILE_PROCESSING_RESULT.PROCESSED
}

export async function processSelectedAudioFiles(
  files: FileList | File[],
  folderId: string | null
): Promise<FileProcessingResult> {
  const list = Array.from(files)
  const hasAudio = list.some((file) => isValidAudioFile(file))

  if (!hasAudio) {
    toast.errorKey('validationInvalidAudioFormat')
    return FILE_PROCESSING_RESULT.IGNORED
  }

  const { blocked } = await evaluateUploadGuardrails(list)
  if (blocked) {
    return FILE_PROCESSING_RESULT.BLOCKED
  }

  await ingestFiles({
    files: list,
    folderId,
  })
  void checkStorageQuota({ mode: 'silent' })
  return FILE_PROCESSING_RESULT.PROCESSED
}

export async function processSelectedSubtitleFile(
  files: FileList | File[],
  targetTrackId: string | null
): Promise<FileProcessingResult> {
  if (!targetTrackId) {
    return FILE_PROCESSING_RESULT.IGNORED
  }

  const list = Array.from(files)
  const { blocked } = await evaluateUploadGuardrails(list)
  if (blocked) {
    return FILE_PROCESSING_RESULT.BLOCKED
  }

  const firstFile = list[0]
  if (!firstFile) {
    return FILE_PROCESSING_RESULT.IGNORED
  }

  await attachSubtitleToTrack(firstFile, targetTrackId)
  void checkStorageQuota({ mode: 'silent' })
  return FILE_PROCESSING_RESULT.PROCESSED
}

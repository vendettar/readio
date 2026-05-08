import { log, error as logError } from './logger'
import {
  createAudioFileSchema,
  createSubtitleFileSchema,
  isValidAudioFile,
  isValidSubtitleFile,
} from './schemas/files'
import { checkStorageQuota, evaluateUploadGuardrails } from './storageQuota'
import { toast } from './toast'
import type { TranslationKey } from './translations'

export interface FileHandlerServiceActions {
  loadAudio: (file: File) => Promise<void>
  loadSubtitles: (file: File) => Promise<void>
}

export async function processSelectedFiles(
  files: FileList | File[],
  actions: FileHandlerServiceActions
): Promise<void> {
  const audioSchema = createAudioFileSchema()
  const subtitleSchema = createSubtitleFileSchema()
  const list = Array.from(files)

  const { blocked } = await evaluateUploadGuardrails(list)
  if (blocked) {
    return
  }

  let processed = false

  for (const file of list) {
    try {
      if (isValidAudioFile(file)) {
        const result = audioSchema.safeParse(file)
        if (result.success) {
          log('[FileHandler] Loading validated audio:', file.name)
          await actions.loadAudio(file)
          processed = true
          continue
        }

        const messageKey = result.error.issues[0]?.message as TranslationKey | undefined
        toast.errorKey(messageKey ?? 'toastFileValidationError')
        continue
      }

      if (isValidSubtitleFile(file)) {
        const result = subtitleSchema.safeParse(file)
        if (result.success) {
          log('[FileHandler] Loading validated subtitle:', file.name)
          await actions.loadSubtitles(file)
          processed = true
          continue
        }

        const messageKey = result.error.issues[0]?.message as TranslationKey | undefined
        toast.errorKey(messageKey ?? 'toastFileValidationError')
        continue
      }

      log('[FileHandler] Unsupported file ignored:', file.name)
      toast.errorKey('toastFileValidationError')
    } catch (err) {
      logError('[FileHandler] Error validating file:', file.name, err)
      toast.errorKey('toastFileValidationError')
    }
  }

  if (processed) {
    void checkStorageQuota({ mode: 'silent' })
  }
}

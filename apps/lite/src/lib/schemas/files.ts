// src/lib/schemas/files.ts
import { z } from 'zod'
import { translate } from '../i18nUtils'

// Size limits
export const MAX_AUDIO_SIZE_BYTES = 500 * 1024 * 1024 // 500MB
export const MAX_SUBTITLE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

// Valid extensions
export const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.webm']
export const SUBTITLE_EXTENSIONS = ['.srt', '.vtt']

// Basic browser File schema
const browserFileSchema = z.instanceof(File)

/**
 * Validate if file is a valid audio file (MIME or extension)
 */
export function isValidAudioFile(file: File): boolean {
  const hasValidExt = AUDIO_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))
  const hasValidMime = file.type.startsWith('audio/')
  return hasValidExt || hasValidMime
}

/**
 * Validate if file is a valid subtitle file
 */
export function isValidSubtitleFile(file: File): boolean {
  return SUBTITLE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))
}

/**
 * Audio File Validation Schema Factory
 * Creates schema with current locale error messages
 */
export function createAudioFileSchema() {
  return browserFileSchema
    .refine((file) => file.size <= MAX_AUDIO_SIZE_BYTES, {
      message: translate('validationFileTooLarge'),
    })
    .refine((file) => isValidAudioFile(file), {
      message: translate('validationInvalidAudioFormat'),
    })
}

/**
 * Subtitle File Validation Schema Factory
 */
export function createSubtitleFileSchema() {
  return browserFileSchema
    .refine((file) => file.size <= MAX_SUBTITLE_SIZE_BYTES, {
      message: translate('validationFileTooLarge'),
    })
    .refine((file) => isValidSubtitleFile(file), {
      message: translate('validationInvalidSubtitleFormat'),
    })
}

// Legacy exports for backwards compatibility (static schemas)
export const audioFileSchema = browserFileSchema.refine((file) => isValidAudioFile(file), {
  message: 'Invalid audio file format',
})

export const subtitleFileSchema = browserFileSchema.refine((file) => isValidSubtitleFile(file), {
  message: 'Invalid subtitle file format',
})

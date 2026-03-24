// src/lib/schemas/files.ts
import { z } from 'zod'
import type { TranslationKey } from '../translations'

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
 * IMPORTANT:
 * - Zod error messages MUST be translation keys (not translated strings).
 * - Call sites should surface errors via toast.*Key() to keep i18n centralized.
 */
export function createAudioFileSchema() {
  return browserFileSchema
    .refine((file) => file.size <= MAX_AUDIO_SIZE_BYTES, {
      message: 'validationFileTooLarge' satisfies TranslationKey,
    })
    .refine((file) => isValidAudioFile(file), {
      message: 'validationInvalidAudioFormat' satisfies TranslationKey,
    })
}

/**
 * Subtitle File Validation Schema Factory
 */
export function createSubtitleFileSchema() {
  return browserFileSchema
    .refine((file) => file.size <= MAX_SUBTITLE_SIZE_BYTES, {
      message: 'validationFileTooLarge' satisfies TranslationKey,
    })
    .refine((file) => isValidSubtitleFile(file), {
      message: 'validationInvalidSubtitleFormat' satisfies TranslationKey,
    })
}

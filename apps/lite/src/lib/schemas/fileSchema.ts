// src/lib/schemas/fileSchema.ts
import { z } from 'zod'

// Basic browser File schema
const browserFileSchema = z.instanceof(File)

/**
 * Audio File Validation Schema
 * Lite Version Policy: MIME type + extension check only.
 * Magic number check is deferred to backend/native layers.
 */
export const audioFileSchema = browserFileSchema.refine(
  (file) => {
    // 1. Extension check
    const validExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.webm']
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))

    // 2. MIME type check
    const hasValidMime = file.type.startsWith('audio/')

    return hasValidExt || hasValidMime
  },
  {
    message: 'Invalid audio file format (MIME type or extension mismatch)',
  }
)

/**
 * Subtitle File Validation Schema
 */
export const subtitleFileSchema = browserFileSchema.refine(
  (file) => {
    const validExtensions = ['.srt', '.vtt']
    return validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
  },
  {
    message: 'Invalid subtitle file format',
  }
)

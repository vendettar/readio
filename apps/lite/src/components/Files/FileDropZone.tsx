// src/components/Files/FileDropZone.tsx
// Drag and drop zone for file uploads using react-dropzone

import { Upload } from 'lucide-react'
import { type ReactNode, useCallback } from 'react'
import { type FileRejection, useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import {
  AUDIO_EXTENSIONS,
  createAudioFileSchema,
  createSubtitleFileSchema,
  isValidAudioFile,
  isValidSubtitleFile,
  SUBTITLE_EXTENSIONS,
} from '../../lib/schemas/files'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/utils'

interface FileDropZoneProps {
  onFilesAccepted: (files: File[]) => void
  children: ReactNode
  className?: string
  disabled?: boolean
}

/**
 * FileDropZone - Wraps content with drag-and-drop file upload functionality
 *
 * Features:
 * - Uses react-dropzone for consistent behavior
 * - Validates files against audio/subtitle schemas
 * - Shows glassmorphism overlay when dragging
 * - Displays toast errors for rejected files
 */
export function FileDropZone({
  onFilesAccepted,
  children,
  className,
  disabled = false,
}: FileDropZoneProps) {
  const { t } = useTranslation()

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // Handle rejected files (rejected by dropzone filters)
      for (const _rejection of rejectedFiles) {
        toast.errorKey('toastFileValidationError')
      }

      // Filter and validate accepted files using schemas
      const validFiles: File[] = []
      const audioSchema = createAudioFileSchema()
      const subtitleSchema = createSubtitleFileSchema()

      for (const file of acceptedFiles) {
        if (isValidAudioFile(file)) {
          const result = audioSchema.safeParse(file)
          if (result.success) {
            validFiles.push(file)
          } else {
            const message = result.error.issues[0]?.message
            if (message) toast.error(message)
            else toast.errorKey('toastFileValidationError')
          }
        } else if (isValidSubtitleFile(file)) {
          const result = subtitleSchema.safeParse(file)
          if (result.success) {
            validFiles.push(file)
          } else {
            const message = result.error.issues[0]?.message
            if (message) toast.error(message)
            else toast.errorKey('toastFileValidationError')
          }
        } else {
          toast.errorKey('toastFileValidationError')
        }
      }

      // Process valid files
      if (validFiles.length > 0) {
        onFilesAccepted(validFiles)
      }
    },
    [onFilesAccepted]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    noClick: true, // Don't open file dialog on click - we have separate buttons for that
    accept: {
      'audio/*': AUDIO_EXTENSIONS,
      'text/plain': SUBTITLE_EXTENSIONS,
      'application/x-subrip': ['.srt'],
      'text/vtt': ['.vtt'],
    },
  })

  return (
    <div {...getRootProps()} className={cn('relative', className)}>
      <input {...getInputProps()} />

      {/* Drop overlay with glassmorphism */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-3 text-primary">
            <Upload size={48} className="animate-bounce" />
            <span className="text-lg font-medium">{t('dropzoneActive')}</span>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}

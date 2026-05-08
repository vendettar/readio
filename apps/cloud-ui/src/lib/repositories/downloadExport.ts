import { formatDateForFilenameUTC } from '../dateUtils'
import type { FileSubtitle, SubtitleText } from '../dexieDb'
import {
  getSubtitleExportMimeType,
  type SubtitleExportFormat,
  serializeSubtitleExport,
} from '../subtitles'

export interface DownloadExportResult {
  ok: boolean
  filename?: string
  blob?: Blob
  failedItems?: Array<{ name: string; reason: string }>
}

export interface SubtitleExportData {
  filename: string
  content: string
  mimeType: string
}

const DEFAULT_EXPORT_FILENAME_SEGMENTS = {
  episodeTitle: 'episode',
  provider: 'unknown-provider',
  model: 'unknown-model',
  manualSubtitle: 'subtitle.srt',
} as const

const MAX_FILENAME_SEGMENT_LENGTH = 80
const SRT_EXTENSION = '.srt'
const VTT_EXTENSION = '.vtt'

export function resolveAudioBundleFilename(
  filename: string | undefined,
  episodeTitle: string,
  contentType: string
): string {
  const trimmed = filename?.trim() ?? ''
  if (trimmed) {
    const safeFilename = trimUnsafeArchiveFilename(trimmed)
    if (safeFilename) {
      return safeFilename
    }
  }

  const episodeSegment = formatFilenameSegment(
    episodeTitle,
    DEFAULT_EXPORT_FILENAME_SEGMENTS.episodeTitle
  )
  const extension = inferAudioExtension(contentType)
  return `${episodeSegment}${extension}`
}

export function buildSubtitleExportData(
  fileSub: FileSubtitle,
  subtitle: SubtitleText,
  episodeTitle: string,
  formatOverride?: SubtitleExportFormat
): SubtitleExportData {
  const originalFilename = resolveSubtitleExportFilename(fileSub, episodeTitle)
  const format = formatOverride ?? resolveSubtitleExportFormat(fileSub, originalFilename)
  return {
    filename: normalizeExportFilenameExtension(originalFilename, format),
    content: serializeSubtitleExport(subtitle.cues, format),
    mimeType: getSubtitleExportMimeType(format),
  }
}

export function getDeterministicUniqueFilename(
  baseFilename: string,
  occurrences: Map<string, number>
): string {
  const key = baseFilename.trim().toLowerCase()
  const nextCount = (occurrences.get(key) ?? 0) + 1
  occurrences.set(key, nextCount)

  if (nextCount === 1) {
    return baseFilename
  }

  const extensionIndex = baseFilename.lastIndexOf('.')
  if (extensionIndex <= 0) {
    return `${baseFilename}-${nextCount}`
  }

  const name = baseFilename.slice(0, extensionIndex)
  const extension = baseFilename.slice(extensionIndex)
  return `${name}-${nextCount}${extension}`
}

export function formatArchiveBaseName(value: string | undefined, fallback: string): string {
  return formatFilenameSegment(value, fallback)
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function formatFilenameSegment(value: string | undefined, fallback: string): string {
  const sanitized = sanitizeFilenameSegment(value || '').slice(0, MAX_FILENAME_SEGMENT_LENGTH)
  return sanitized || fallback
}

function formatSubtitleExportFilename(input: {
  episodeTitle: string
  provider?: string
  model?: string
  timestampMs: number
}): string {
  const episodeTitle = formatFilenameSegment(
    input.episodeTitle,
    DEFAULT_EXPORT_FILENAME_SEGMENTS.episodeTitle
  )
  const provider = formatFilenameSegment(input.provider, DEFAULT_EXPORT_FILENAME_SEGMENTS.provider)
  const model = formatFilenameSegment(input.model, DEFAULT_EXPORT_FILENAME_SEGMENTS.model)
  const date = formatDateForFilenameUTC(input.timestampMs)
  return `${episodeTitle}.${provider}.${model}.${date}.srt`
}

function formatManualSubtitleExportFilename(name: string | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return DEFAULT_EXPORT_FILENAME_SEGMENTS.manualSubtitle

  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, '-').trim()
  return sanitized || DEFAULT_EXPORT_FILENAME_SEGMENTS.manualSubtitle
}

function inferAudioExtension(contentType: string): string {
  const mime = contentType.trim().toLowerCase()
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3'
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a'
  if (mime.includes('ogg')) return '.ogg'
  if (mime.includes('wav')) return '.wav'
  if (mime.includes('aac')) return '.aac'
  if (mime.includes('flac')) return '.flac'
  return '.audio'
}

function trimUnsafeArchiveFilename(filename: string): string {
  return filename
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveSubtitleExportFilename(fileSub: FileSubtitle, episodeTitle: string): string {
  if (fileSub.sourceKind === 'manual_upload') {
    return formatManualSubtitleExportFilename(fileSub.name)
  }

  return formatSubtitleExportFilename({
    episodeTitle,
    provider: fileSub.provider,
    model: fileSub.model,
    timestampMs: fileSub.createdAt || Date.now(),
  })
}

function resolveSubtitleExportFormat(
  fileSub: FileSubtitle,
  filename: string
): SubtitleExportFormat {
  if (fileSub.sourceKind !== 'manual_upload') {
    return 'srt'
  }

  return getFilenameExtension(filename) === VTT_EXTENSION ? 'vtt' : 'srt'
}

function normalizeExportFilenameExtension(filename: string, format: SubtitleExportFormat): string {
  const normalized = filename.trim()
  const fallback =
    format === 'vtt' ? `subtitle${VTT_EXTENSION}` : DEFAULT_EXPORT_FILENAME_SEGMENTS.manualSubtitle
  const source = normalized || fallback
  const { stem } = splitFilename(source)
  const extension = format === 'vtt' ? VTT_EXTENSION : SRT_EXTENSION

  return `${stem}${extension}`
}

function getFilenameExtension(filename: string): string {
  const { extension } = splitFilename(filename)
  return extension.toLowerCase()
}

function splitFilename(filename: string): { stem: string; extension: string } {
  const normalized = filename.trim()
  const extensionIndex = normalized.lastIndexOf('.')
  if (extensionIndex <= 0 || extensionIndex === normalized.length - 1) {
    return { stem: normalized, extension: '' }
  }

  return {
    stem: normalized.slice(0, extensionIndex),
    extension: normalized.slice(extensionIndex),
  }
}

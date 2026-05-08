import type { FileSubtitle } from '../db/types'
import { db } from '../dexieDb'

export function normalizeSubtitleProviderModelValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function sortSubtitleVersionsNewestFirst<T extends { createdAt?: number }>(
  versions: T[]
): T[] {
  return [...versions].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export function resolveDuplicateSubtitleFilename(
  filename: string,
  existingNames: string[],
  fallbackName?: string
): string {
  const trimmed = filename.trim() || fallbackName || filename.trim()
  const normalizedBase = trimmed || fallbackName || 'subtitle.srt'
  const { stem, extension } = splitFilename(normalizedBase)
  let candidate = normalizedBase
  let counter = 2

  while (
    existingNames.some((existing) => existing.trim().toLowerCase() === candidate.toLowerCase())
  ) {
    candidate = `${stem} (${counter})${extension}`
    counter += 1
  }

  return candidate
}

export function findLatestAsrSubtitleVersion(
  versions: FileSubtitle[],
  provider: string,
  model: string
): FileSubtitle | undefined {
  const providerKey = normalizeSubtitleProviderModelValue(provider)
  const modelKey = normalizeSubtitleProviderModelValue(model)

  return sortSubtitleVersionsNewestFirst(
    versions.filter((version) => {
      if (version.sourceKind === 'manual_upload') return false
      return (
        normalizeSubtitleProviderModelValue(version.provider) === providerKey &&
        normalizeSubtitleProviderModelValue(version.model) === modelKey
      )
    })
  )[0]
}

export async function replaceSubtitleVersionContentAndCleanup(input: {
  versionId: string
  oldSubtitleId: string
  newSubtitleId: string
  patch: Partial<FileSubtitle>
}): Promise<void> {
  await db.local_subtitles.update(input.versionId, {
    subtitleId: input.newSubtitleId,
    ...input.patch,
  })
  await deleteSubtitleIfUnreferenced(input.oldSubtitleId)
}

export async function deleteSubtitleIfUnreferenced(subtitleId: string): Promise<void> {
  const oldRefCount = await db.local_subtitles.where('subtitleId').equals(subtitleId).count()
  if (oldRefCount === 0) {
    await db.subtitles.delete(subtitleId)
  }
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

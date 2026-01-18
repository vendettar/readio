// src/lib/files/sortFolders.ts
import type { FileFolder } from '../dexieDb'

/**
 * Sorts folders with the following priority:
 * 1. Pinned folders first (sorted by pinnedAt desc - most recently pinned first)
 * 2. Unpinned folders (sorted by name A→Z, locale-aware)
 */
export function sortFolders(folders: FileFolder[]): FileFolder[] {
  return [...folders].sort((a, b) => {
    const aIsPinned = typeof a.pinnedAt === 'number'
    const bIsPinned = typeof b.pinnedAt === 'number'

    // Pinned folders come first
    if (aIsPinned && !bIsPinned) return -1
    if (!aIsPinned && bIsPinned) return 1

    // Both pinned: sort by pinnedAt desc (most recently pinned first)
    if (aIsPinned && bIsPinned) {
      return (b.pinnedAt as number) - (a.pinnedAt as number)
    }

    // Both unpinned: sort by name A→Z
    return a.name.localeCompare(b.name)
  })
}

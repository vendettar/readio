// src/lib/files/__tests__/sortFolders.test.ts
import { describe, expect, it } from 'vitest'
import type { FileFolder } from '../../dexieDb'
import { sortFolders } from '../sortFolders'

describe('sortFolders', () => {
  it('should sort pinned folders before unpinned folders', () => {
    const folders: FileFolder[] = [
      { id: 'uuid-1', name: 'Zebra', createdAt: 1000 },
      { id: 'uuid-2', name: 'Aardvark', createdAt: 2000, pinnedAt: 5000 },
      { id: 'uuid-3', name: 'Banana', createdAt: 3000 },
    ]

    const sorted = sortFolders(folders)

    expect(sorted[0].name).toBe('Aardvark') // pinned
    expect(sorted[1].name).toBe('Banana') // unpinned, A→Z
    expect(sorted[2].name).toBe('Zebra') // unpinned, A→Z
  })

  it('should sort multiple pinned folders by pinnedAt desc', () => {
    const folders: FileFolder[] = [
      { id: 'uuid-1', name: 'First Pinned', createdAt: 1000, pinnedAt: 1000 },
      { id: 'uuid-2', name: 'Second Pinned', createdAt: 2000, pinnedAt: 2000 },
      { id: 'uuid-3', name: 'Third Pinned', createdAt: 3000, pinnedAt: 3000 },
    ]

    const sorted = sortFolders(folders)

    expect(sorted[0].name).toBe('Third Pinned') // most recently pinned
    expect(sorted[1].name).toBe('Second Pinned')
    expect(sorted[2].name).toBe('First Pinned')
  })

  it('should sort unpinned folders by name A→Z', () => {
    const folders: FileFolder[] = [
      { id: 'uuid-1', name: 'Zebra', createdAt: 1000 },
      { id: 'uuid-2', name: 'Aardvark', createdAt: 2000 },
      { id: 'uuid-3', name: 'Mango', createdAt: 3000 },
    ]

    const sorted = sortFolders(folders)

    expect(sorted[0].name).toBe('Aardvark')
    expect(sorted[1].name).toBe('Mango')
    expect(sorted[2].name).toBe('Zebra')
  })

  it('should handle empty array', () => {
    const sorted = sortFolders([])
    expect(sorted).toEqual([])
  })

  it('should not mutate original array', () => {
    const folders: FileFolder[] = [
      { id: 'uuid-1', name: 'B', createdAt: 1000 },
      { id: 'uuid-2', name: 'A', createdAt: 2000 },
    ]
    const original = [...folders]

    sortFolders(folders)

    expect(folders).toEqual(original)
  })
})

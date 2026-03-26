import { describe, expect, it } from 'vitest'
import type { FileSubtitle } from '../../../lib/db/types'
import { groupSubtitlesByTrackId } from '../FilesFolderPage'

describe('groupSubtitlesByTrackId', () => {
  it('groups subtitles by trackId while preserving input order per track', () => {
    const subtitles = [
      { id: 's1', trackId: 't1' },
      { id: 's2', trackId: 't2' },
      { id: 's3', trackId: 't1' },
    ] as FileSubtitle[]

    const grouped = groupSubtitlesByTrackId(subtitles)

    expect(grouped.t1?.map((s) => s.id)).toEqual(['s1', 's3'])
    expect(grouped.t2?.map((s) => s.id)).toEqual(['s2'])
    expect(grouped.t3).toBeUndefined()
  })
})

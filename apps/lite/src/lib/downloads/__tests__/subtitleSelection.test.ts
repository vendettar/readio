import { describe, expect, it } from 'vitest'
import { selectPlaybackSubtitle } from '../subtitleSelection'

function makeReady(id: string) {
  return {
    fileSub: { id },
    subtitle: { cues: [{ start: 0, end: 1, text: id }] },
  }
}

describe('selectPlaybackSubtitle', () => {
  it('uses repository-prioritized first subtitle for card play (no override)', () => {
    const readySubs = [makeReady('db-active'), makeReady('newest-ready')]
    expect(selectPlaybackSubtitle(readySubs)?.fileSub.id).toBe('db-active')
  })

  it('uses override subtitle when override id exists', () => {
    const readySubs = [makeReady('db-active'), makeReady('explicit-sub')]
    expect(selectPlaybackSubtitle(readySubs, 'explicit-sub')?.fileSub.id).toBe('explicit-sub')
  })

  it('falls back to first ready subtitle when override id is stale', () => {
    const readySubs = [makeReady('db-active'), makeReady('newest-ready')]
    expect(selectPlaybackSubtitle(readySubs, 'stale-id')?.fileSub.id).toBe('db-active')
  })

  it('returns undefined when there is no ready subtitle', () => {
    expect(selectPlaybackSubtitle([])).toBeUndefined()
  })
})

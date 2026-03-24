import { describe, expect, it } from 'vitest'
import { resolveLayoutPrefixFromState } from '../PodcastShowPage'

describe('PodcastShowPage transition state parsing', () => {
  it('reads fromLayoutPrefix from location.state when present', () => {
    expect(resolveLayoutPrefixFromState({ fromLayoutPrefix: 'top-shows' })).toBe('top-shows')
  })

  it('falls back deterministically when state is absent/invalid', () => {
    expect(resolveLayoutPrefixFromState(undefined)).toBeUndefined()
    expect(resolveLayoutPrefixFromState(null)).toBeUndefined()
    expect(resolveLayoutPrefixFromState({ fromLayoutPrefix: '' })).toBeUndefined()
    expect(resolveLayoutPrefixFromState({ fromLayoutPrefix: 123 })).toBeUndefined()
  })
})

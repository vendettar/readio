import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPlaybackBlobUrlOwnerForTests,
  collectPlaybackBlobUrls,
  createPlaybackBlobUrl,
  isPlaybackBlobUrlActive,
  revokePlaybackBlobUrl,
  revokePlaybackBlobUrls,
} from '../playerBlobUrls'

describe('playerBlobUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetPlaybackBlobUrlOwnerForTests()
  })

  it('should create and register playback blob urls', () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:owned-audio')

    const url = createPlaybackBlobUrl(new Blob(['audio'], { type: 'audio/mpeg' }))

    expect(url).toBe('blob:owned-audio')
    expect(isPlaybackBlobUrlActive(url)).toBe(true)
  })

  it('should revoke an owned playback blob url once', () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:owned-audio')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const url = createPlaybackBlobUrl(new Blob(['audio']))

    revokePlaybackBlobUrl(url)
    revokePlaybackBlobUrl(url)

    expect(revokeSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith('blob:owned-audio')
    expect(isPlaybackBlobUrlActive(url)).toBe(false)
  })

  it('should dedupe batch revocation', () => {
    vi.spyOn(URL, 'createObjectURL')
      .mockImplementationOnce(() => 'blob:one')
      .mockImplementationOnce(() => 'blob:two')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const first = createPlaybackBlobUrl(new Blob(['one']))
    const second = createPlaybackBlobUrl(new Blob(['two']))

    revokePlaybackBlobUrls([first, second, first])

    expect(revokeSpy).toHaveBeenCalledTimes(2)
    expect(revokeSpy).toHaveBeenCalledWith('blob:one')
    expect(revokeSpy).toHaveBeenCalledWith('blob:two')
  })

  it('should collect and register only blob urls from playback state', () => {
    const urls = collectPlaybackBlobUrls('blob:audio', 'https://example.com/cover.jpg')

    expect(urls).toEqual(['blob:audio'])
    expect(isPlaybackBlobUrlActive('blob:audio')).toBe(true)
    expect(collectPlaybackBlobUrls('https://example.com/audio.mp3', new Blob(['cover']))).toEqual(
      []
    )
  })
})

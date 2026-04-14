import { describe, expect, it, vi } from 'vitest'
import { DB } from '../../dexieDb'
import { PlaybackRepository } from '../PlaybackRepository'

describe('PlaybackRepository', () => {
  it('proxies playback APIs to DB', async () => {
    const getAllSpy = vi.spyOn(DB, 'getAllPlaybackSessions').mockResolvedValue([])
    const deleteSpy = vi.spyOn(DB, 'deletePlaybackSession').mockResolvedValue()
    const lastSpy = vi.spyOn(DB, 'getLastPlaybackSession').mockResolvedValue(undefined)
    const updateSpy = vi.spyOn(DB, 'updatePlaybackSession').mockResolvedValue()
    const addAudioSpy = vi.spyOn(DB, 'addAudioBlob').mockResolvedValue('audio-1')
    const getAudioSpy = vi.spyOn(DB, 'getAudioBlob').mockResolvedValue(undefined)
    const addSubtitleSpy = vi.spyOn(DB, 'addSubtitle').mockResolvedValue('sub-1')
    const getSubtitleSpy = vi.spyOn(DB, 'getSubtitle').mockResolvedValue(undefined)

    const blob = new Blob(['x'], { type: 'audio/mp3' })

    await expect(PlaybackRepository.getAllPlaybackSessions()).resolves.toEqual([])
    await PlaybackRepository.deletePlaybackSession('session-1')
    await expect(PlaybackRepository.getLastPlaybackSession()).resolves.toBeUndefined()
    await PlaybackRepository.updatePlaybackSession('session-1', { progress: 10 })
    await expect(PlaybackRepository.addAudioBlob(blob, 'a.mp3')).resolves.toBe('audio-1')
    await expect(PlaybackRepository.getAudioBlob('audio-1')).resolves.toBeUndefined()
    await expect(PlaybackRepository.addSubtitle([], 'a.srt')).resolves.toBe('sub-1')
    await expect(PlaybackRepository.getSubtitle('sub-1')).resolves.toBeUndefined()

    expect(getAllSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith('session-1')
    expect(lastSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith('session-1', { progress: 10 })
    expect(addAudioSpy).toHaveBeenCalledWith(blob, 'a.mp3')
    expect(getAudioSpy).toHaveBeenCalledWith('audio-1')
    expect(addSubtitleSpy).toHaveBeenCalledWith([], 'a.srt', undefined)
    expect(getSubtitleSpy).toHaveBeenCalledWith('sub-1')
  })
})

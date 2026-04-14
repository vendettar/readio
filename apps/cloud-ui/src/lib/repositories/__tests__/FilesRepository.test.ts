import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB, db } from '../../dexieDb'
import { FilesRepository, UPSERT_FILE_ASR_SUBTITLE_REASON } from '../FilesRepository'

describe('FilesRepository', () => {
  it('proxies files APIs to DB', async () => {
    const getFoldersSpy = vi.spyOn(DB, 'getAllFolders').mockResolvedValue([])
    const getTracksSpy = vi.spyOn(DB, 'getAllFileTracks').mockResolvedValue([])
    const getInFolderSpy = vi.spyOn(DB, 'getFileTracksInFolder').mockResolvedValue([])
    const getFolderSpy = vi.spyOn(DB, 'getFolder').mockResolvedValue(undefined)

    const getAudioSpy = vi.spyOn(DB, 'getAudioBlob').mockResolvedValue(undefined)
    const getSettingSpy = vi.spyOn(DB, 'getSetting').mockResolvedValue('x')
    const setSettingSpy = vi.spyOn(DB, 'setSetting').mockResolvedValue()
    const getSubtitlesSpy = vi.spyOn(DB, 'getFileSubtitlesForTrack').mockResolvedValue([])
    const updateFolderSpy = vi.spyOn(DB, 'updateFolder').mockResolvedValue()
    const updateTrackSpy = vi.spyOn(DB, 'updateFileTrack').mockResolvedValue()
    const deleteTrackSpy = vi.spyOn(DB, 'deleteFileTrack').mockResolvedValue()
    const deleteSubtitleSpy = vi.spyOn(DB, 'deleteFileSubtitle').mockResolvedValue()

    await expect(FilesRepository.getAllFolders()).resolves.toEqual([])
    await expect(FilesRepository.getAllFileTracks()).resolves.toEqual([])
    await expect(FilesRepository.getFileTracksInFolder('folder-1')).resolves.toEqual([])
    await expect(FilesRepository.getFolder('folder-1')).resolves.toBeUndefined()
    await expect(FilesRepository.getAudioBlob('blob-1')).resolves.toBeUndefined()
    await expect(FilesRepository.getSetting('k')).resolves.toBe('x')
    await FilesRepository.setSetting('k', 'v')
    await expect(FilesRepository.getFileSubtitlesForTrack('track-1')).resolves.toEqual([])
    await FilesRepository.updateFolder('folder-1', { name: 'new' })
    await FilesRepository.updateFileTrack('track-1', { name: 'new' })
    await FilesRepository.deleteFileTrack('track-1')
    await FilesRepository.deleteFileSubtitle('subtitle-1')

    expect(getFoldersSpy).toHaveBeenCalledTimes(1)
    expect(getTracksSpy).toHaveBeenCalledTimes(1)
    expect(getInFolderSpy).toHaveBeenCalledWith('folder-1')
    expect(getFolderSpy).toHaveBeenCalledWith('folder-1')
    expect(getAudioSpy).toHaveBeenCalledWith('blob-1')
    expect(getSettingSpy).toHaveBeenCalledWith('k')
    expect(setSettingSpy).toHaveBeenCalledWith('k', 'v')
    expect(getSubtitlesSpy).toHaveBeenCalledWith('track-1')
    expect(updateFolderSpy).toHaveBeenCalledWith('folder-1', { name: 'new' })
    expect(updateTrackSpy).toHaveBeenCalledWith('track-1', { name: 'new' })
    expect(deleteTrackSpy).toHaveBeenCalledWith('track-1')
    expect(deleteSubtitleSpy).toHaveBeenCalledWith('subtitle-1')
  })

  describe('upsertAsrSubtitleVersion', () => {
    beforeEach(async () => {
      await DB.clearAllData()
    })

    async function createFileTrackWithSubtitles(count: number): Promise<{ trackId: string }> {
      const audioId = await DB.addAudioBlob(new Blob(['audio']), 'track.mp3')
      const trackId = await DB.addFileTrack({
        name: 'Local Track',
        audioId,
        sizeBytes: 1024,
        durationSeconds: 120,
        folderId: null,
      })

      for (let i = 0; i < count; i++) {
        const subtitleId = await DB.addSubtitle(
          [{ start: i, end: i + 1, text: `subtitle-${i}` }],
          `subtitle-${i}.srt`
        )
        await db.local_subtitles.add({
          id: `file-sub-${i}`,
          trackId,
          subtitleId,
          name: `ASR subtitle ${i}`,
          sourceKind: 'asr_online',
          provider: 'groq',
          model: 'whisper',
          createdAt: Date.now() + i,
          status: 'ready',
        })
      }

      return { trackId }
    }

    it('replaces existing ASR subtitle when provider+model matches', async () => {
      const { trackId } = await createFileTrackWithSubtitles(2)
      await DB.updateFileTrack(trackId, { activeSubtitleId: 'file-sub-1' })

      const matchedBefore = await db.local_subtitles.get('file-sub-1')
      if (!matchedBefore) {
        throw new Error('Expected existing matched subtitle')
      }
      const oldSubtitleId = matchedBefore.subtitleId

      const result = await FilesRepository.upsertAsrSubtitleVersion({
        trackId,
        cues: [{ start: 0, end: 1, text: 'new transcript' }],
        subtitleName: 'Local Track - groq - whisper',
        subtitleFilename: 'local.groq.whisper.srt',
        provider: 'groq',
        model: 'whisper',
      })

      expect(result.ok).toBe(true)
      expect(result.reason).toBe(UPSERT_FILE_ASR_SUBTITLE_REASON.REPLACED)
      expect(result.fileSubtitleId).toBe('file-sub-1')

      const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
      expect(versions).toHaveLength(2)

      const replaced = await db.local_subtitles.get('file-sub-1')
      expect(replaced?.subtitleId).not.toBe(oldSubtitleId)
      expect(replaced?.provider).toBe('groq')
      expect(replaced?.model).toBe('whisper')

      expect(await db.subtitles.get(oldSubtitleId)).toBeUndefined()
      const track = await DB.getFileTrack(trackId)
      expect(track?.activeSubtitleId).toBe('file-sub-1')
    })

    it('creates a new ASR subtitle when provider differs even if model is same', async () => {
      const { trackId } = await createFileTrackWithSubtitles(1)

      const result = await FilesRepository.upsertAsrSubtitleVersion({
        trackId,
        cues: [{ start: 0, end: 1, text: 'new provider transcript' }],
        subtitleName: 'Local Track - qwen - whisper',
        subtitleFilename: 'local.qwen.whisper.srt',
        provider: 'qwen',
        model: 'whisper',
      })

      expect(result.ok).toBe(true)
      expect(result.reason).toBe(UPSERT_FILE_ASR_SUBTITLE_REASON.CREATED)
      expect(result.fileSubtitleId).toBeDefined()

      const versions = await db.local_subtitles.where('trackId').equals(trackId).toArray()
      expect(versions).toHaveLength(2)
      expect(
        versions.some((version) => version.provider === 'groq' && version.model === 'whisper')
      ).toBe(true)
      expect(
        versions.some((version) => version.provider === 'qwen' && version.model === 'whisper')
      ).toBe(true)

      const track = await DB.getFileTrack(trackId)
      expect(track?.activeSubtitleId).toBe(result.fileSubtitleId)
    })
  })
})

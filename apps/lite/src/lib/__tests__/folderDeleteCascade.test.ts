import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../dexieDb'

describe(' files folder delete cascade', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('deletes folder tracks and subtitle blobs', async () => {
    const folderId = await DB.addFolder('Test Folder')

    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'a.mp3')
    const subtitleId = await DB.addSubtitle([{ start: 0, end: 1, text: 'Hi' }], 'a.srt')

    const trackId = await DB.addFileTrack({
      folderId,
      name: 'Track',
      audioId,
      sizeBytes: 1,
      durationSeconds: 1,
    })

    await DB.addFileSubtitle({
      trackId,
      name: 'Subtitle',
      subtitleId,
    })

    await DB.deleteFolder(folderId)

    expect(await DB.getFolder(folderId)).toBeUndefined()
    expect(await db.tracks.get(trackId)).toBeUndefined()
    expect(await DB.getFileSubtitlesForTrack(trackId)).toEqual([])
    expect(await DB.getAudioBlob(audioId)).toBeUndefined()
    expect(await DB.getSubtitle(subtitleId)).toBeUndefined()
  })
})

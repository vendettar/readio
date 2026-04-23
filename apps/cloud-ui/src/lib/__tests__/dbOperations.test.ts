import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../dexieDb'

describe('Dexie database operations', () => {
  beforeEach(async () => {
    // Ensure a clean state between tests.
    // This project does not preserve old DB snapshots between runs; we can safely reset data.
    await DB.clearAllData()
  })

  it('can create and retrieve playback sessions', async () => {
    await DB.createPlaybackSession({
      id: 'test_session_1',
      progress: 12,
      durationSeconds: 345,
      audioFilename: 'test.mp3',
    })

    const session = await DB.getPlaybackSession('test_session_1')
    expect(session).toBeDefined()
    expect(session?.id).toBe('test_session_1')
    expect(session?.progress).toBe(12)
    expect(session?.durationSeconds).toBe(345)
    expect(session?.audioFilename).toBe('test.mp3')
  })

  it('can update existing playback sessions', async () => {
    await DB.createPlaybackSession({ id: 'test_session_2', progress: 0 })
    await DB.updatePlaybackSession('test_session_2', { progress: 100 })

    const session = await DB.getPlaybackSession('test_session_2')
    expect(session?.progress).toBe(100)
  })

  it('can store and retrieve settings', async () => {
    await DB.setSetting('country', 'us')
    const value = await DB.getSetting('country')
    expect(value).toBe('us')
  })

  it('returns null for non-existent settings', async () => {
    const value = await DB.getSetting('non_existent_key')
    expect(value).toBeNull()
  })

  it('can get last playback session ordered by lastPlayedAt', async () => {
    const oldId = `last_test_old_${Date.now()}`
    const newId = `last_test_new_${Date.now()}`

    await DB.createPlaybackSession({ id: oldId, lastPlayedAt: 1000 })
    // Use a slight delay to ensure different timestamps if needed,
    // but here we explicitly set it.
    await DB.createPlaybackSession({ id: newId, lastPlayedAt: Date.now() + 1000000 })

    const lastSession = await DB.getLastPlaybackSession()
    expect(lastSession?.id).toBe(newId)
  })

  it('finds the latest playback session by audioUrl', async () => {
    await DB.createPlaybackSession({
      id: 'audio-url-session-old',
      title: 'Older URL Session',
      audioUrl: 'https://example.com/audio.mp3',
      lastPlayedAt: 1000,
    })
    await DB.createPlaybackSession({
      id: 'audio-url-session-new',
      title: 'Newer URL Session',
      audioUrl: 'https://example.com/audio.mp3',
      lastPlayedAt: 2000,
    })

    const latest = await DB.findLastSessionByUrl('https://example.com/audio.mp3')

    expect(latest?.id).toBe('audio-url-session-new')
  })

  it('finds the latest playback session by localTrackId', async () => {
    await DB.createPlaybackSession({
      id: 'track-session-old',
      source: 'local',
      title: 'Older Track Session',
      localTrackId: 'track-1',
      lastPlayedAt: 1000,
    })
    await DB.createPlaybackSession({
      id: 'track-session-new',
      source: 'local',
      title: 'Newer Track Session',
      localTrackId: 'track-1',
      lastPlayedAt: 2000,
    })

    const latest = await DB.findLastSessionByTrackId('track-1')

    expect(latest?.id).toBe('track-session-new')
  })

  it('supports remote transcript cache CRUD operations', async () => {
    const id = 'remote-transcript:https://example.com/ep-1.srt'
    await DB.upsertRemoteTranscript({
      id,
      url: 'https://example.com/ep-1.srt',
      cues: [{ start: 0, end: 1, text: 'Hello' }],
      cueSchemaVersion: 1,
      cueCount: 1,
      source: 'podcast-transcript',
    })

    const byId = await DB.getRemoteTranscriptById(id)
    expect(byId?.url).toBe('https://example.com/ep-1.srt')

    const byUrl = await DB.getRemoteTranscriptByUrl('https://example.com/ep-1.srt')
    expect(byUrl?.id).toBe(id)

    await DB.upsertRemoteTranscript({
      id,
      url: 'https://example.com/ep-1.srt',
      cues: [{ start: 0, end: 1, text: 'Updated' }],
      cueSchemaVersion: 1,
      cueCount: 1,
      source: 'podcast-transcript',
    })
    const updated = await DB.getRemoteTranscriptById(id)
    expect(updated?.cues[0].text).toBe('Updated')

    await DB.deleteRemoteTranscriptById(id)
    expect(await DB.getRemoteTranscriptById(id)).toBeUndefined()
  })

  it('clearAllData wipes remote transcript cache table', async () => {
    await DB.upsertRemoteTranscript({
      id: 'remote-transcript:https://example.com/ep-2.srt',
      url: 'https://example.com/ep-2.srt',
      cues: [{ start: 0, end: 1, text: 'Cleanup' }],
      cueSchemaVersion: 1,
      cueCount: 1,
      source: 'podcast-transcript',
    })

    await DB.clearAllData()
    expect(await DB.getAllRemoteTranscripts()).toHaveLength(0)
  })

  it('persists structural cues on subtitle and remote transcript records', async () => {
    const cues = [{ start: 0, end: 1.2, text: 'Hello' }]
    const subtitleId = await DB.addSubtitle(cues, 'asr.srt', 'fingerprint-1')
    const subtitle = await DB.getSubtitle(subtitleId)
    expect(subtitle?.cues).toEqual(cues)
    expect(subtitle?.asrFingerprint).toBe('fingerprint-1')

    await DB.upsertRemoteTranscript({
      id: 'remote-transcript:https://example.com/audio.mp3',
      url: 'https://example.com/audio.mp3',
      cues,
      cueSchemaVersion: 1,
      source: 'asr-groq',
    })

    const remote = await DB.getRemoteTranscriptByUrl('https://example.com/audio.mp3')
    expect(remote?.cues).toEqual(cues)
    expect(remote?.source).toBe('asr-groq')
  })

  it('persists explicit createdAt for file subtitle links', async () => {
    const trackId = await DB.addFileTrack({
      folderId: null,
      name: 'Track A',
      audioId: 'audio-1',
      sizeBytes: 123,
    })
    const subtitleId = await DB.addSubtitle([{ start: 0, end: 1, text: 'One' }], 'one.srt')
    const createdAt = Date.now()
    await DB.addFileSubtitle({
      trackId,
      subtitleId,
      name: 'one.srt',
      createdAt,
    })

    const subtitles = await DB.getFileSubtitlesForTrack(trackId)
    expect(subtitles).toHaveLength(1)
    expect(subtitles[0].createdAt).toBe(createdAt)
  })

  it('returns file subtitles in stable display order (oldest first, then name tie-break)', async () => {
    const trackId = await DB.addFileTrack({
      folderId: null,
      name: 'Track B',
      audioId: 'audio-2',
      sizeBytes: 456,
    })
    const subtitleA = await DB.addSubtitle([{ start: 0, end: 1, text: 'A' }], 'a.srt')
    const subtitleB = await DB.addSubtitle([{ start: 0, end: 1, text: 'B' }], 'b.srt')
    const subtitleC = await DB.addSubtitle([{ start: 0, end: 1, text: 'C' }], 'c.srt')

    await DB.addFileSubtitle({
      trackId,
      subtitleId: subtitleC,
      name: 'Episode.srt (3)',
      createdAt: 0,
    })
    await DB.addFileSubtitle({
      trackId,
      subtitleId: subtitleA,
      name: 'Episode.srt',
      createdAt: 0,
    })
    await DB.addFileSubtitle({
      trackId,
      subtitleId: subtitleB,
      name: 'Episode.srt (2)',
      createdAt: 0,
    })

    const subtitles = await DB.getFileSubtitlesForTrack(trackId)
    expect(subtitles.map((item) => item.name)).toEqual([
      'Episode.srt',
      'Episode.srt (2)',
      'Episode.srt (3)',
    ])
  })

  it('deleteFileTrack clears local playback references and removes unreferenced audio blob', async () => {
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'track-c.mp3')
    const trackId = await DB.addFileTrack({
      folderId: null,
      name: 'Track C',
      audioId,
      sizeBytes: 1,
    })

    await DB.createPlaybackSession({
      id: 'session-file-track',
      source: 'local',
      title: 'Track C',
      audioId,
      hasAudioBlob: true,
      localTrackId: trackId,
    })

    await DB.deleteFileTrack(trackId)

    const session = await DB.getPlaybackSession('session-file-track')
    expect(session?.localTrackId).toBeNull()
    expect(session?.audioId).toBeNull()
    expect(session?.hasAudioBlob).toBe(false)
    expect(await db.tracks.get(trackId)).toBeUndefined()
    expect(await DB.getAudioBlob(audioId)).toBeUndefined()
  })

  it('deleteFileTrack preserves audio blob when still referenced by another session', async () => {
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'track-d.mp3')
    const trackId = await DB.addFileTrack({
      folderId: null,
      name: 'Track D',
      audioId,
      sizeBytes: 1,
    })

    await DB.createPlaybackSession({
      id: 'session-explore-audio-ref',
      source: 'explore',
      title: 'Remote reference',
      audioId,
      hasAudioBlob: true,
      localTrackId: null,
      countryAtSave: 'us',
    })

    await DB.deleteFileTrack(trackId)

    expect(await db.tracks.get(trackId)).toBeUndefined()
    expect(await DB.getAudioBlob(audioId)).toBeDefined()
    const session = await DB.getPlaybackSession('session-explore-audio-ref')
    expect(session?.audioId).toBe(audioId)
    expect(session?.hasAudioBlob).toBe(true)
  })

  it('deleteFileTrack preserves shared blob when still referenced as audio by another track', async () => {
    const sharedBlobId = await DB.addAudioBlob(new Blob(['shared']), 'shared.mp3')
    const trackAudioId = await DB.addAudioBlob(new Blob(['track']), 'track.mp3')
    const trackToDelete = await DB.addFileTrack({
      folderId: null,
      name: 'Track with shared artwork',
      audioId: trackAudioId,
      artworkId: sharedBlobId,
      sizeBytes: 1,
    })
    const survivingTrack = await DB.addFileTrack({
      folderId: null,
      name: 'Track using shared audio',
      audioId: sharedBlobId,
      sizeBytes: 1,
    })

    await DB.deleteFileTrack(trackToDelete)

    expect(await db.tracks.get(trackToDelete)).toBeUndefined()
    expect(await db.tracks.get(survivingTrack)).toBeDefined()
    expect(await DB.getAudioBlob(sharedBlobId)).toBeDefined()
  })

  it('clearPlaybackSessionAudioCache removes unreferenced blob and clears session flags', async () => {
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'session-only.mp3')
    await DB.createPlaybackSession({
      id: 'session-cache-clear',
      source: 'local',
      title: 'Session cache clear',
      audioId,
      hasAudioBlob: true,
    })

    const didClear = await DB.clearPlaybackSessionAudioCache('session-cache-clear')
    expect(didClear).toBe(true)

    const session = await DB.getPlaybackSession('session-cache-clear')
    expect(session?.audioId).toBeNull()
    expect(session?.hasAudioBlob).toBe(false)
    expect(await DB.getAudioBlob(audioId)).toBeUndefined()
  })

  it('clearPlaybackSessionAudioCache keeps shared blob when referenced by track', async () => {
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'shared-by-track.mp3')
    await DB.createPlaybackSession({
      id: 'session-shared-track',
      source: 'local',
      title: 'Session shared track',
      audioId,
      hasAudioBlob: true,
    })
    await DB.addFileTrack({
      folderId: null,
      name: 'Track shared',
      audioId,
      sizeBytes: 1,
    })

    const didClear = await DB.clearPlaybackSessionAudioCache('session-shared-track')
    expect(didClear).toBe(true)
    expect(await DB.getAudioBlob(audioId)).toBeDefined()
  })

  it('clearPlaybackSessionAudioCache keeps shared blob when referenced by another session', async () => {
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'shared-by-session.mp3')
    await DB.createPlaybackSession({
      id: 'session-shared-a',
      source: 'local',
      title: 'Shared A',
      audioId,
      hasAudioBlob: true,
    })
    await DB.createPlaybackSession({
      id: 'session-shared-b',
      source: 'local',
      title: 'Shared B',
      audioId,
      hasAudioBlob: true,
    })

    const didClear = await DB.clearPlaybackSessionAudioCache('session-shared-a')
    expect(didClear).toBe(true)

    const a = await DB.getPlaybackSession('session-shared-a')
    const b = await DB.getPlaybackSession('session-shared-b')
    expect(a?.audioId).toBeNull()
    expect(a?.hasAudioBlob).toBe(false)
    expect(b?.audioId).toBe(audioId)
    expect(b?.hasAudioBlob).toBe(true)
    expect(await DB.getAudioBlob(audioId)).toBeDefined()
  })

  it('clearPlaybackSessionAudioCache keeps shared blob when referenced as artwork', async () => {
    const cachedAudioId = await DB.addAudioBlob(new Blob(['audio']), 'shared-artwork.mp3')
    const trackAudioId = await DB.addAudioBlob(new Blob(['track-audio']), 'track-audio.mp3')
    await DB.createPlaybackSession({
      id: 'session-shared-artwork',
      source: 'local',
      title: 'Shared artwork',
      audioId: cachedAudioId,
      hasAudioBlob: true,
    })

    await DB.addFileTrack({
      folderId: null,
      name: 'Artwork ref track',
      audioId: trackAudioId,
      artworkId: cachedAudioId,
      sizeBytes: 1,
    })

    const didClear = await DB.clearPlaybackSessionAudioCache('session-shared-artwork')
    expect(didClear).toBe(true)
    expect(await DB.getAudioBlob(cachedAudioId)).toBeDefined()
  })

  it('clearPlaybackSessionAudioCache preserves unrelated session fields', async () => {
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'session-concurrent.mp3')
    await DB.createPlaybackSession({
      id: 'session-concurrent',
      source: 'local',
      title: 'Original title',
      lastPlayedAt: 1000,
      audioId,
      hasAudioBlob: true,
    })

    const didClear = await DB.clearPlaybackSessionAudioCache('session-concurrent')
    expect(didClear).toBe(true)

    const session = await DB.getPlaybackSession('session-concurrent')
    expect(session?.audioId).toBeNull()
    expect(session?.hasAudioBlob).toBe(false)
    expect(session?.title).toBe('Original title')
    expect(session?.lastPlayedAt).toBe(1000)
  })

  it('clearPlaybackSessionAudioCache returns false for missing audio cache', async () => {
    await DB.createPlaybackSession({
      id: 'session-no-audio',
      source: 'local',
      title: 'No audio',
      audioId: null,
      hasAudioBlob: false,
    })

    const didClear = await DB.clearPlaybackSessionAudioCache('session-no-audio')
    expect(didClear).toBe(false)
  })

  it('deleteAudioBlob does not delete referenced blob', async () => {
    const audioId = await DB.addAudioBlob(new Blob(['audio']), 'referenced-blob.mp3')
    await DB.createPlaybackSession({
      id: 'session-ref-blob',
      source: 'local',
      title: 'Ref blob',
      audioId,
      hasAudioBlob: true,
    })

    await DB.deleteAudioBlob(audioId)
    expect(await DB.getAudioBlob(audioId)).toBeDefined()
  })

  it('deleteSubtitle does not delete referenced subtitle blob', async () => {
    const trackId = await DB.addFileTrack({
      folderId: null,
      name: 'Track subtitle ref',
      audioId: 'audio-sub-ref',
      sizeBytes: 1,
    })
    const subtitleId = await DB.addSubtitle([{ start: 0, end: 1, text: 'hello' }], 'ref.srt')
    await DB.addFileSubtitle({
      trackId,
      subtitleId,
      name: 'ref.srt',
    })

    await DB.deleteSubtitle(subtitleId)
    expect(await DB.getSubtitle(subtitleId)).toBeDefined()
  })

  it('rejects favorite persistence when countryAtSave is missing', async () => {
    await expect(
      DB.addFavorite({
        key: 'k-1',
        feedUrl: 'https://example.com/feed.xml',
        audioUrl: 'https://example.com/audio.mp3',
        episodeTitle: 'Episode',
        podcastTitle: 'Podcast',
        artworkUrl: '',
        addedAt: Date.now(),
      })
    ).rejects.toThrow(/country/i)
  })

  it('rejects explore playback session persistence when countryAtSave is missing', async () => {
    await expect(
      DB.createPlaybackSession({
        id: 'session-explore-missing-country',
        source: 'explore',
        title: 'Explore episode',
        episodeGuid: 'episode-guid-1',
      })
    ).rejects.toThrow(/country/i)
  })
})

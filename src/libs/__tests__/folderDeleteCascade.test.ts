import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '../dexieDb';

describe(' files folder delete cascade', () => {
    beforeEach(async () => {
        await DB.clearAllData();
    });

    it('deletes folder tracks and subtitle blobs', async () => {
        const folderId = await DB.addFolder('Test Folder');

        const audioId = await DB.addAudioBlob(new Blob(['audio']), 'a.mp3');
        const subtitleId = await DB.addSubtitle('1\n00:00:00,000 --> 00:00:01,000\nHi\n', 'a.srt');

        const trackId = await DB.addFileTrack({
            folderId,
            name: 'Track',
            audioId,
            sizeBytes: 1,
            durationSeconds: 1,
        });

        await DB.addFileSubtitle({
            trackId,
            name: 'Subtitle',
            subtitleId,
        });

        await DB.deleteFolder(folderId);

        expect(await DB.getFolder(folderId)).toBeUndefined();
        expect(await DB.getFileTrack(trackId)).toBeUndefined();
        expect(await DB.getFileSubtitlesForTrack(trackId)).toEqual([]);
        expect(await DB.getAudioBlob(audioId)).toBeUndefined();
        expect(await DB.getSubtitle(subtitleId)).toBeUndefined();
    });
});

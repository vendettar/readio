// src/hooks/useFileHandler.ts
import { useCallback, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { DB } from '../libs/dexieDb';
import { generateSessionId } from '../libs/session';
import { log, error as logError } from '../libs/logger';
import { toast } from '../libs/toast';

export function useFileHandler() {
    const { audioLoaded, subtitlesLoaded, loadAudio, loadSubtitles, setSessionId } = usePlayerStore();

    // Track pending audio/subtitle IDs for session creation
    const pendingAudioRef = useRef<{ id: string; filename: string } | null>(null);
    const pendingSubtitleRef = useRef<{ id: string; filename: string } | null>(null);

    /**
     * Create or update a session binding audioId and subtitleId
     */
    const createOrUpdateSession = useCallback(async () => {
        const audio = pendingAudioRef.current;
        const subtitle = pendingSubtitleRef.current;

        // At minimum require audio to create a session
        if (!audio) return;

        const sessionId = generateSessionId();

        try {
            await DB.createPlaybackSession({
                id: sessionId,
                audioId: audio.id,
                audioFilename: audio.filename,
                subtitleId: subtitle?.id || null,
                subtitleFilename: subtitle?.filename || '',
                hasAudioBlob: true,
                subtitleType: subtitle ? 'srt' : null,
            });

            setSessionId(sessionId);
            log('[FileHandler] Created playback session:', sessionId);
        } catch (err) {
            logError('[FileHandler] Failed to create playback session:', err);
        }
    }, [setSessionId]);

    const processFiles = useCallback(async (files: FileList | File[]) => {
        // Reset pending refs
        pendingAudioRef.current = null;
        pendingSubtitleRef.current = null;

        for (const file of Array.from(files)) {
            if (file.name.endsWith('.mp3') || file.name.endsWith('.m4a') ||
                file.name.endsWith('.wav') || file.name.endsWith('.ogg') ||
                file.type.startsWith('audio/')) {
                loadAudio(file);
                // Save to DB for files visibility
                try {
                    const audioId = await DB.addAudioBlob(file, file.name);
                    pendingAudioRef.current = { id: audioId, filename: file.name };
                    log('[FileHandler] Saved audio to DB:', file.name, audioId);
                } catch (err) {
                    logError('[FileHandler] Failed to save audio to DB:', err);
                    toast.errorKey('toastSaveAudioFailed');
                }
            } else if (file.name.endsWith('.srt')) {
                await loadSubtitles(file);
                // Save to DB for files visibility
                try {
                    const content = await file.text();
                    const subtitleId = await DB.addSubtitle(content, file.name);
                    pendingSubtitleRef.current = { id: subtitleId, filename: file.name };
                    log('[FileHandler] Saved subtitle to DB:', file.name, subtitleId);
                } catch (err) {
                    logError('[FileHandler] Failed to save subtitle to DB:', err);
                    toast.errorKey('toastSaveSubtitleFailed');
                }
            }
        }

        // After processing all files, create session if we have audio
        if (pendingAudioRef.current) {
            await createOrUpdateSession();
        }
    }, [loadAudio, loadSubtitles, createOrUpdateSession]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        processFiles(e.dataTransfer.files);
    }, [processFiles]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processFiles(e.target.files);
        }
    }, [processFiles]);

    return {
        audioLoaded,
        subtitlesLoaded,
        processFiles,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleFileChange,
    };
}

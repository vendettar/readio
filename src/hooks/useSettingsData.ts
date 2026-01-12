// src/hooks/useSettingsData.ts
// Hook for loading Settings page data

import { useState, useEffect, useCallback } from 'react';
import { DB, type PlaybackSession } from '../libs/dexieDb';
import { logError } from '../libs/logger';

type StorageInfo = Awaited<ReturnType<typeof DB.getStorageInfo>>;

export function useSettingsData() {
    const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
    const [sessions, setSessions] = useState<PlaybackSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const reload = useCallback(async () => {
        try {
            const info = await DB.getStorageInfo();
            setStorageInfo(info);
            const items = await DB.getAllPlaybackSessions();
            setSessions(items);
        } catch (err) {
            logError('[useSettingsData] Failed to load data:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    return {
        storageInfo,
        sessions,
        isLoading,
        reload,
    };
}

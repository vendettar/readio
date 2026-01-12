import { useNavigate } from '@tanstack/react-router';
import { useRef, useCallback, useState, useEffect } from 'react';
import { Plus, Upload, Check, X, Home, FileAudio } from 'lucide-react';
import { DndContext, DragOverlay, type Modifier } from '@dnd-kit/core';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useI18n } from '../../hooks/useI18n';
import { useFilesData } from '../../hooks/useFilesData';
import { useFileProcessing } from '../../hooks/useFileProcessing';
import { useFileDragDrop } from '../../hooks/useFileDragDrop';
import { useFolderManagement } from '../../hooks/useFolderManagement';
import { DB } from '../../libs/dexieDb';
import { useFilePlayback } from '../../hooks/useFilePlayback';
import { warn as logWarn, logError } from '../../libs/logger';
import { toast } from '../../libs/toast';
import { FolderCard } from '../../components/Files/FolderCard';
import { TrackCard } from '../../components/Files/TrackCard';
import { EmptyState } from '../../components/Files/EmptyState';
import { ViewControlsBar } from '../../components/Files/ViewControlsBar';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { sortFolders } from '../../libs/files/sortFolders';
import type { ViewDensity } from '../../components/Files/types';

const snapCenterCursor: Modifier = ({ transform, activatorEvent, activeNodeRect }) => {
    if (!activatorEvent || !activeNodeRect) return transform;

    // Calculate position regardless of device (mouse or touch)
    const clientX = 'clientX' in activatorEvent ? (activatorEvent as MouseEvent).clientX : (activatorEvent as TouchEvent).touches?.[0]?.clientX;
    const clientY = 'clientY' in activatorEvent ? (activatorEvent as MouseEvent).clientY : (activatorEvent as TouchEvent).touches?.[0]?.clientY;

    if (clientX === undefined || clientY === undefined) return transform;

    return {
        ...transform,
        x: transform.x + (clientX - activeNodeRect.left),
        y: transform.y + (clientY - activeNodeRect.top),
    };
};

export default function FilesIndexPage() {
    const { t } = useI18n();
    const navigate = useNavigate();
    useKeyboardShortcuts({ isModalOpen: false });

    // Data management
    const {
        folders,
        tracks,
        subtitles,
        currentFolder,
        currentFolderId,
        setCurrentFolderId,
        lastPlayedMap,
        folderCounts,
        loadData,
        status
    } = useFilesData();

    // Load data on mount and when folder changes
    useEffect(() => {
        void loadData();
    }, [loadData, currentFolderId]);

    // Density state with persistence
    const [density, setDensity] = useState<ViewDensity>('comfortable');

    const loadDensity = useCallback(async () => {
        const saved = await DB.getSetting('files.viewDensity');
        if (saved === 'compact') setDensity('compact');
    }, []);

    useEffect(() => {
        window.requestAnimationFrame(() => {
            void loadDensity();
        });
    }, [loadDensity]);

    const handleDensityChange = useCallback(async (value: ViewDensity) => {
        setDensity(value);
        try {
            await DB.setSetting('files.viewDensity', value);
        } catch (err) {
            logWarn('[Files] Failed to persist density setting', err);
        }
    }, []);

    // File processing
    const { handleAudioInputChange, handleSubtitleInputChange } = useFileProcessing({
        currentFolderId,
        onComplete: loadData,
    });

    // Drag & Drop
    const {
        sensors,
        activeDragItem,
        isDragging,
        handleDragStart,
        handleDragEnd,
        handleDragCancel,
        handleMoveTo,
    } = useFileDragDrop({ onComplete: loadData });

    const [dragPreviewWidthPx, setDragPreviewWidthPx] = useState<number | null>(null);

    const [folderCardWidthPx, setFolderCardWidthPx] = useState<number | null>(null);
    const [folderMeasureEl, setFolderMeasureEl] = useState<HTMLDivElement | null>(null);

    const folderMeasureRef = useCallback((node: HTMLDivElement | null) => {
        setFolderMeasureEl(node);
    }, []);

    useEffect(() => {
        if (!folderMeasureEl) return;

        window.requestAnimationFrame(() => {
            setFolderCardWidthPx(folderMeasureEl.offsetWidth || null);
        });

        if (typeof ResizeObserver === 'undefined') return;

        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const width = Math.round(entry.contentRect.width);
            setFolderCardWidthPx(width > 0 ? width : null);
        });

        ro.observe(folderMeasureEl);
        return () => ro.disconnect();
    }, [folderMeasureEl]);

    const getDragPreviewWidthPx = useCallback(() => {
        if (!folderCardWidthPx) return null;
        const paddingDelta = density === 'compact' ? 8 : 12;
        return Math.max(140, Math.round(folderCardWidthPx - paddingDelta));
    }, [density, folderCardWidthPx]);

    const handleDragStartWithPreview = useCallback(
        (event: Parameters<typeof handleDragStart>[0]) => {
            setDragPreviewWidthPx(getDragPreviewWidthPx());
            handleDragStart(event);
        },
        [getDragPreviewWidthPx, handleDragStart]
    );

    const handleDragEndWithPreview = useCallback(
        (event: Parameters<typeof handleDragEnd>[0]) => {
            setDragPreviewWidthPx(null);
            void handleDragEnd(event);
        },
        [handleDragEnd]
    );

    const handleDragCancelWithPreview = useCallback(() => {
        setDragPreviewWidthPx(null);
        handleDragCancel();
    }, [handleDragCancel]);

    // Folder management
    const {
        isNamingFolder,
        setIsNamingFolder,
        newFolderName,
        setNewFolderName,
        namingInputRef,
        namingContainerRef,
        handleCreateFolder,
        handleConfirmNewFolder,
        executeDeleteFolder,
    } = useFolderManagement({
        setCurrentFolderId,
        onComplete: loadData,
        folders: folders || [],
    });

    // File input refs
    const audioInputRef = useRef<HTMLInputElement>(null);
    const subtitleInputRef = useRef<HTMLInputElement>(null);
    const [targetTrackId, setTargetTrackId] = useState<number | null>(null);
    // Note: track delete confirmation is handled by TrackOverflowMenu (secondary popover).

    // Playback logic refactored into hook
    const { handlePlay, handleSetActiveSubtitle } = useFilePlayback({ onComplete: loadData });

    const existingTrackNames = tracks?.map(t => t.name) || [];
    const isInitialLoading = status === 'loading' && (!folders?.length && !tracks?.length);

    const renderFolderSkeleton = () => (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-card/60 animate-pulse p-4 h-32" />
            ))}
        </div>
    );

    const renderTrackSkeleton = () => (
        <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-card/60 animate-pulse h-24" />
            ))}
        </div>
    );

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStartWithPreview}
            onDragEnd={handleDragEndWithPreview}
            onDragCancel={handleDragCancelWithPreview}
        >
            <div className="px-8 py-10 max-w-screen-2xl mx-auto min-h-full">
                {/* Header */}
                <header className="mb-8 flex items-end justify-between">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-4xl font-bold text-foreground tracking-tight">
                            {currentFolder ? currentFolder.name : t('filesTitle')}
                        </h1>
                        {!currentFolder && (
                            <p className="text-muted-foreground text-sm">{t('filesSubtitle')}</p>
                        )}
                    </div>

                    <div className="flex items-start gap-3">
                        {currentFolderId === null && (
                            <Button
                                variant="secondary"
                                onClick={handleCreateFolder}
                                className="gap-2"
                            >
                                <Plus size={18} />
                                <span>{t('filesNewFolder')}</span>
                            </Button>
                        )}
                        <Button
                            onClick={() => audioInputRef.current?.click()}
                            className="gap-2"
                        >
                            <Upload size={18} />
                            <span>{t('filesAddAudio')}</span>
                        </Button>
                    </div>
                </header>

                {/* View Controls Bar */}
                <ViewControlsBar
                    density={density}
                    onDensityChange={handleDensityChange}
                />

                {/* Hidden file inputs */}
                <input
                    type="file"
                    accept=".srt,.vtt"
                    ref={subtitleInputRef}
                    onChange={(e) => handleSubtitleInputChange(e, targetTrackId, subtitleInputRef, () => setTargetTrackId(null))}
                    className="hidden"
                />
                <input
                    type="file"
                    accept="audio/*"
                    multiple
                    ref={audioInputRef}
                    onChange={(e) => handleAudioInputChange(e, audioInputRef)}
                    className="hidden"
                />

                <div className="space-y-8 pb-20">
                    {isInitialLoading && (
                        <>
                            {currentFolderId === null && renderFolderSkeleton()}
                            {renderTrackSkeleton()}
                        </>
                    )}
                    {/* Folders Grid (Only in Root) */}
                    {!isInitialLoading && currentFolderId === null && (
                        <div>
                            {((folders && folders.length > 0) || isNamingFolder) && (
                                <div className="mb-4">
                                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                                        {t('filesFolders')}
                                    </h2>
                                    <p className="text-xs text-muted-foreground mt-1">{t('filesFolderHelperText')}</p>
                                </div>
                            )}

                            <div className={cn(
                                "grid gap-4",
                                density === 'compact'
                                    ? "grid-cols-3 md:grid-cols-5 lg:grid-cols-7"
                                    : "grid-cols-2 md:grid-cols-4 lg:grid-cols-5"
                            )}>
                                {/* Inline New Folder Input */}
                                {isNamingFolder && (
                                    <div
                                        ref={namingContainerRef}
                                        className="group flex flex-col items-center justify-center p-6 rounded-xl border border-primary bg-primary/5 shadow-sm transition-all duration-200 relative"
                                    >
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3 bg-primary/20 text-primary">
                                            <Plus size={24} />
                                        </div>
                                        <Input
                                            ref={namingInputRef}
                                            type="text"
                                            placeholder={t('filesFolderName')}
                                            value={newFolderName}
                                            onChange={(e) => setNewFolderName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleConfirmNewFolder();
                                                if (e.key === 'Escape') setIsNamingFolder(false);
                                            }}
                                            onBlur={handleConfirmNewFolder}
                                            className="text-center"
                                        />
                                        <div className="flex items-center gap-2 mt-3">
                                            <Button
                                                size="icon"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={handleConfirmNewFolder}
                                                className="h-8 w-8"
                                            >
                                                <Check size={14} />
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="icon"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => setIsNamingFolder(false)}
                                                className="h-8 w-8"
                                            >
                                                <X size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {sortFolders(folders).map((folder, index) => {
                                    return (
                                        <FolderCard
                                            key={folder.id}
                                            folder={folder}
                                            itemCount={folder.id ? folderCounts[folder.id] || 0 : 0}
                                            density={density}
                                            isDragging={isDragging}
                                            measureRef={index === 0 ? folderMeasureRef : undefined}
                                            onClick={() => navigate({ to: '/files/folder/$folderId', params: { folderId: String(folder.id) } })}
                                            onPin={async () => {
                                                await DB.updateFolder(folder.id!, { pinnedAt: Date.now() });
                                                loadData();
                                            }}
                                            onUnpin={async () => {
                                                await DB.updateFolder(folder.id!, { pinnedAt: undefined });
                                                loadData();
                                            }}
                                            existingFolderNames={folders?.map(f => f.name)}
                                            onRename={async (newName) => {
                                                await DB.updateFolder(folder.id!, { name: newName });
                                                loadData();
                                            }}
                                            onDelete={() => executeDeleteFolder(folder)}
                                            isDropDisabled={!activeDragItem}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Back to Root Button */}
                    {!isInitialLoading && currentFolderId !== null && (
                        <div
                            className="p-4 rounded-xl border border-dashed border-border text-muted-foreground flex items-center justify-center gap-2 cursor-pointer hover:bg-muted hover:border-muted-foreground/30 transition-colors"
                            onClick={() => setCurrentFolderId(null)}
                        >
                            <Home size={18} />
                            <span className="font-medium">{t('filesBackToRoot')}</span>
                        </div>
                    )}

                    {/* Tracks List */}
                    {!isInitialLoading && (
                    <div>
                        {/* Only show FILES title when we are at root AND folders exist (to distinguish sections) */}
                        {(tracks && tracks.length > 0) && (currentFolderId === null && (folders && folders.length > 0)) && (
                            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">
                                {t('filesFiles')}
                            </h2>
                        )}
                        {(tracks && tracks.length > 0) ? (
                            <div className={density === 'compact' ? 'space-y-2' : 'space-y-4'}>
                                {tracks.map(track => {
                                    const trackSubs = subtitles.filter(s => s.trackId === track.id);

                                    return (
                                        <TrackCard
                                            key={track.id}
                                            track={track}
                                            subtitles={trackSubs}
                                            folders={folders}
                                            density={density}
                                            lastPlayedAt={track.audioId ? lastPlayedMap[track.audioId] : undefined}
                                            isGlobalDragging={isDragging}
                                            existingTrackNames={existingTrackNames}
                                            onPlay={(t, s) => handlePlay(t, subtitles, s)}
                                            onSetActiveSubtitle={handleSetActiveSubtitle}
                                            onRename={async (newName) => {
                                                if (!track.id) return;
                                                try {
                                                    await DB.updateFileTrack(track.id, { name: newName });
                                                    await loadData();
                                                } catch (err) {
                                                    logError('[Files] Failed to rename track', err);
                                                    toast.errorKey('toastRenameFailed');
                                                }
                                            }}
                                            onDeleteTrack={async () => {
                                                if (!track.id) return false;
                                                try {
                                                    await DB.deleteFileTrack(track.id);
                                                    await loadData();
                                                    return true;
                                                } catch (err) {
                                                    logError('[Files] Failed to delete track', err);
                                                    toast.errorKey('toastDeleteFailed');
                                                    return false;
                                                }
                                            }}
                                            onDeleteSub={(id) => DB.deleteFileSubtitle(id).then(loadData)}
                                            onAddSub={() => { setTargetTrackId(track.id!); subtitleInputRef.current?.click(); }}
                                            onMove={(folderId) => handleMoveTo(track, folderId)}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            // Only show EmptyState if we are inside a folder OR if (at root and no folders)
                            // This hides the "Start building..." message when user has collections but no root files
                            ((!folders || folders.length === 0) || currentFolderId !== null) && (
                                <EmptyState isFolder={currentFolderId !== null} />
                            )
                        )}
                    </div>
                    )}
                </div>

                <DragOverlay dropAnimation={null} modifiers={[snapCenterCursor]}>
                    {activeDragItem ? (
                        <div
                            className={cn(
                                'bg-card border border-primary shadow-xl rounded-xl w-[var(--drag-preview-w)] flex items-center opacity-90 pointer-events-none -translate-x-1/2 -translate-y-1/2',
                                density === 'compact' ? 'p-2.5 gap-2.5' : 'p-3 gap-3'
                            )}
                            style={{ '--drag-preview-w': `${dragPreviewWidthPx ?? 280}px` } as React.CSSProperties}
                        >
                            <div
                                className={cn(
                                    'flex-shrink-0 bg-muted flex items-center justify-center text-muted-foreground',
                                    density === 'compact' ? 'w-7 h-7 rounded-md' : 'w-8 h-8 rounded-lg'
                                )}
                            >
                                <FileAudio size={density === 'compact' ? 14 : 16} />
                            </div>
                            <span
                                className={cn(
                                    'min-w-0 flex-1 text-foreground font-semibold leading-tight whitespace-normal break-words overflow-hidden',
                                    density === 'compact' ? 'text-xs max-h-9' : 'text-sm max-h-10'
                                )}
                            >
                                {activeDragItem.name}
                            </span>
                        </div>
                    ) : null}
                </DragOverlay>

            </div >
        </DndContext >
    );
}

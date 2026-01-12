// src/components/Transcript/TranscriptView.tsx
import { useRef, useCallback, useEffect } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import type { subtitle } from '../../libs/subtitles';
import { SubtitleLine } from './SubtitleLine';
import { useSelection } from '../../hooks/useSelection';
import { refreshHighlights } from '../../libs/selection';
import { ContextMenu, LookupPopover, WordHoverOverlay } from '../Selection';

interface TranscriptViewProps {
    subtitles: subtitle[];
    currentIndex: number;
    onJumpToSubtitle: (index: number) => void;
    isFollowing: boolean;
    onFollowingChange: (following: boolean) => void;
    zoomScale: number;
}

export function TranscriptView({ subtitles, currentIndex, onJumpToSubtitle, isFollowing, onFollowingChange, zoomScale }: TranscriptViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const { state, copyText, searchWeb, lookupFromMenu, closeMenu, closeLookup } = useSelection(containerRef);
    const highlightRefreshHandleRef = useRef<number | null>(null);
    const isProgrammaticScrollRef = useRef(false);
    const lastCurrentIndexRef = useRef(currentIndex);


    const scheduleHighlightsRefresh = useCallback(() => {
        if (highlightRefreshHandleRef.current !== null) return;

        highlightRefreshHandleRef.current = requestAnimationFrame(() => {
            highlightRefreshHandleRef.current = null;
            refreshHighlights();
        });
    }, []);

    // Handle range changes - refresh highlights when rendered items change
    const handleRangeChanged = useCallback(() => {
        scheduleHighlightsRefresh();
    }, [scheduleHighlightsRefresh]);

    // Auto-scroll to current subtitle when following is enabled and index changes
    useEffect(() => {
        if (!isFollowing || currentIndex < 0 || currentIndex >= subtitles.length) {
            lastCurrentIndexRef.current = currentIndex;
            return;
        }

        // Check if index changed
        if (currentIndex === lastCurrentIndexRef.current) {
            return;
        }
        lastCurrentIndexRef.current = currentIndex;

        // Scroll to current index
        if (virtuosoRef.current) {
            isProgrammaticScrollRef.current = true;
            virtuosoRef.current.scrollToIndex({
                index: currentIndex,
                align: 'center',
                behavior: 'smooth'
            });
        }
    }, [currentIndex, subtitles.length, isFollowing]);

    // Scroll to current index when following is re-enabled
    useEffect(() => {
        if (isFollowing && virtuosoRef.current && currentIndex >= 0 && currentIndex < subtitles.length) {
            isProgrammaticScrollRef.current = true;
            virtuosoRef.current.scrollToIndex({
                index: currentIndex,
                align: 'center',
                behavior: 'smooth'
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFollowing]); // Only trigger when isFollowing changes to true

    // Detect user scroll - disable following
    const handleScroll = useCallback(() => {
        if (isProgrammaticScrollRef.current) {
            return;
        }

        // User scrolled manually - stop following
        if (isFollowing) {
            onFollowingChange(false);
        }
    }, [isFollowing, onFollowingChange]);

    // Trigger Virtuoso re-measurement when zoom changes (CSS calc affects line heights)
    useEffect(() => {
        // Force Virtuoso to re-measure all items when zoom scale changes
        // This prevents scroll position drift caused by CSS-calculated heights
        if (virtuosoRef.current) {
            // Small delay to let CSS transitions settle
            const timer = setTimeout(() => {
                // Trigger a simple scroll to force re-measurement
                virtuosoRef.current?.scrollBy({ top: 0, behavior: 'auto' });
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [zoomScale]);

    useEffect(() => {
        return () => {
            if (highlightRefreshHandleRef.current !== null) {
                cancelAnimationFrame(highlightRefreshHandleRef.current);
                highlightRefreshHandleRef.current = null;
            }
        };
    }, []);

    const handleScrollingStateChange = useCallback((isScrolling: boolean) => {
        if (!isScrolling) {
            isProgrammaticScrollRef.current = false;
        }
    }, []);

    return (
        <>
            <div
                id="transcript-container"
                ref={containerRef}
                className="reading-area h-full overflow-auto"
            >
                <Virtuoso
                    key={`virtuoso-${zoomScale}`}
                    ref={virtuosoRef}
                    data={subtitles}
                    totalCount={subtitles.length}
                    itemContent={(index, subtitle) => (
                        <div className="max-w-3xl mx-auto px-6">
                            <SubtitleLine
                                key={`${subtitle.start}-${subtitle.end}`}
                                start={subtitle.start}
                                text={subtitle.text}
                                isActive={index === currentIndex}
                                onClick={() => onJumpToSubtitle(index)}
                            />
                        </div>
                    )}
                    components={{
                        Header: () => <div className="h-20 xl:h-28" />,
                        Footer: () => <div className="h-[50vh]" />,
                    }}
                    rangeChanged={handleRangeChanged}
                    onScroll={handleScroll}
                    isScrolling={handleScrollingStateChange}
                    className="h-full"
                />
            </div>

            {/* Selection UI */}
            <ContextMenu
                state={state}
                onCopy={copyText}
                onSearch={searchWeb}
                onLookup={lookupFromMenu}
                onClose={closeMenu}
            />
            <LookupPopover
                state={state}
                onClose={closeLookup}
            />
            <WordHoverOverlay
                rects={state.hoverRects}
                isPressed={state.showLookup}
            />
        </>
    );
}

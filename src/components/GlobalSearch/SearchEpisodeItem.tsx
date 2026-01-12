import React from 'react';
import { Star, MoreHorizontal } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n';
import { useExploreStore } from '../../store/exploreStore';
import { formatRelativeTime, formatDuration } from '../../libs/dateUtils';
import { stripHtml } from '../../libs/htmlUtils';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { type SearchEpisode, type Episode, type Podcast, lookupPodcastFull } from '../../libs/discoveryProvider';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { InteractiveTitle } from '../interactive/InteractiveTitle';
import { InteractiveArtwork } from '../interactive/InteractiveArtwork';
import { toast } from '../../libs/toast';

interface SearchEpisodeItemProps {
    episode: SearchEpisode;
    onPlay: () => void;
}

export function SearchEpisodeItem({ episode, onPlay }: SearchEpisodeItemProps) {
    const { t } = useI18n();
    const { favorites, addFavorite, removeFavorite } = useExploreStore();

    const [isSaving, setIsSaving] = React.useState(false);
    const rawEpisodeId = episode.episodeGuid || episode.trackId.toString();
    const encodedEpisodeId = encodeURIComponent(rawEpisodeId);
    const podcastId = episode.collectionId?.toString();

    // SearchEpisode might not have feedUrl, so we check favorites by audioUrl
    const favoritedItem = favorites.find(f => f.audioUrl === episode.episodeUrl);
    const favorited = !!favoritedItem;

    const handleToggleFavorite = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (favorited) {
            removeFavorite(favoritedItem.key);
        } else {
            setIsSaving(true);
            try {
                // Optimization: Feed URL is now available in SearchEpisode (entity=podcastEpisode)!
                let podcast: Podcast | null = null;
                if (episode.feedUrl) {
                    podcast = {
                        collectionId: episode.collectionId,
                        collectionName: episode.collectionName,
                        artistName: episode.artistName,
                        artworkUrl100: episode.artworkUrl100,
                        artworkUrl600: episode.artworkUrl600,
                        feedUrl: episode.feedUrl,
                        collectionViewUrl: '',
                        genres: []
                    };
                } else {
                    podcast = await lookupPodcastFull(episode.collectionId.toString());
                }

                if (!podcast) throw new Error('Podcast not found');

                // Construct Episode object from SearchEpisode metadata
                const episodeObj: Episode = {
                    id: episode.episodeGuid ?? episode.trackId.toString(),
                    title: episode.trackName,
                    description: episode.description || '',
                    audioUrl: episode.episodeUrl,
                    pubDate: episode.releaseDate,
                    artworkUrl: episode.artworkUrl600 || episode.artworkUrl100,
                    duration: (episode.trackTimeMillis || 0) / 1000
                };

                await addFavorite(podcast, episodeObj);
            } catch (err) {
                console.error('[SearchEpisodeItem] Failed to favorite:', err);
                toast.errorKey('toastAddFavoriteFailed');
            } finally {
                setIsSaving(false);
            }
        }
    };

    const relativeTime = formatRelativeTime(episode.releaseDate, t);
    const duration = formatDuration((episode.trackTimeMillis || 0) / 1000, t);
    const cleanDescription = stripHtml(episode.description || '');
    const artworkUrl = episode.artworkUrl600 || episode.artworkUrl100;

    return (
        <div className="group/episode relative smart-divider-group pr-4">
            {/* Hover Background - Full area visual only */}
            <div className="absolute inset-y-0 -left-[var(--page-gutter-x)] right-0 rounded-lg bg-foreground/5 opacity-0 group-hover/episode:opacity-100 transition-opacity duration-300 pointer-events-none" />

            <div className="relative flex items-center gap-4 py-3">
                {/* Artwork with Navigation & Play */}
                <div className="relative flex-shrink-0 z-20">
                    <InteractiveArtwork
                        src={artworkUrl}
                        to={podcastId ? '/podcast/$id/episode/$episodeId' : undefined}
                        params={podcastId ? {
                            id: podcastId,
                            episodeId: encodedEpisodeId
                        } : undefined}
                        onPlay={onPlay}
                        playButtonSize="md"
                        playIconSize={20}
                        hoverGroup="episode"
                        size="xl"
                    />
                </div>

                <div className="flex-1 min-w-0 flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-12 py-1">
                        {/* Date & Podcast Title */}
                        <div className="text-xxs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider leading-tight line-clamp-1">
                            {relativeTime && <span>{relativeTime}</span>}
                            {relativeTime && episode.collectionName && <span className="mx-1">•</span>}
                            {episode.collectionName && <span>{episode.collectionName}</span>}
                        </div>

                        {/* Title */}
                        <div className="mb-0.5 z-20 relative">
                            <InteractiveTitle
                                title={episode.trackName}
                                to={podcastId ? '/podcast/$id/episode/$episodeId' : undefined}
                                params={podcastId ? {
                                    id: podcastId,
                                    episodeId: encodedEpisodeId
                                } : undefined}
                                className="text-sm leading-tight"
                            />
                        </div>

                        {/* Description */}
                        {cleanDescription && (
                            <p className="text-xs text-muted-foreground leading-snug line-clamp-3 font-light">
                                {cleanDescription}
                            </p>
                        )}
                    </div>

                    {/* Right Side Actions */}
                    <div className="flex items-center flex-shrink-0 gap-12">
                        {duration && (
                            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap min-w-16 text-right">
                                {duration}
                            </span>
                        )}

                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleToggleFavorite}
                                className={cn(
                                    "w-9 h-9 text-primary hover:bg-transparent hover:text-primary transition-opacity duration-200 relative z-20",
                                    favorited ? "opacity-100" : "opacity-0 group-hover/episode:opacity-100"
                                )}
                                aria-label={favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
                            >
                                <Star
                                    size={16}
                                    className={cn(
                                        "stroke-2",
                                        favorited && "fill-current",
                                        isSaving && "animate-pulse opacity-50"
                                    )}
                                />
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="w-9 h-9 text-primary hover:bg-transparent hover:opacity-80 opacity-0 group-hover/episode:opacity-100 transition-opacity duration-200 relative z-20"
                                        aria-label={t('ariaMoreActions')}
                                    >
                                        <MoreHorizontal size={16} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    sideOffset={8}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded-xl shadow-2xl border border-border/50 bg-popover/95 backdrop-blur-xl p-0 overflow-hidden"
                                >
                                    <DropdownMenuItem
                                        onSelect={(e) => {
                                            handleToggleFavorite(e as unknown as React.MouseEvent);
                                        }}
                                        className="text-sm font-medium focus:bg-primary focus:text-primary-foreground"
                                    >
                                        <Star
                                            size={14}
                                            className={cn(
                                                "mr-2",
                                                favorited && "fill-current",
                                                isSaving && "animate-pulse opacity-50"
                                            )}
                                        />
                                        {favorited ? t('favoritesRemove') : t('favoritesAdd')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
            </div>

            {/* Separator */}
            <div className="absolute bottom-0 left-0 right-4 h-px bg-border group-hover/episode:opacity-0 transition-opacity smart-divider" />
        </div>
    );
}

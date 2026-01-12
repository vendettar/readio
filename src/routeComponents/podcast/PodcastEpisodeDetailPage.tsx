// src/routes/podcast/$id/episode/$episodeId.tsx
// Single episode detail page - Maximum information extraction

import React, { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Play, Star, Calendar, Clock, ExternalLink, FileText, List, HardDrive, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { usePlayerStore } from '@/store/playerStore';
import { useExploreStore } from '@/store/exploreStore';
import { lookupPodcastFull, fetchPodcastFeed, lookupPodcastEpisodes } from '@/libs/discoveryProvider';
import { getDiscoveryArtworkUrl } from '@/libs/imageUtils';
import { stripHtml } from '@/libs/htmlUtils';
import { formatRelativeTime, formatDuration } from '@/libs/dateUtils';
import { cn } from '@/lib/utils';
import { openExternal } from '@/libs/openExternal';

// Helper to format file size
function formatFileSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export default function PodcastEpisodeDetailPage() {
  const { t } = useI18n();
  const { id, episodeId } = useParams({ from: '/podcast/$id/episode/$episodeId' });
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Load favorites on mount
  const loadFavorites = useExploreStore((state) => state.loadFavorites);
  const favoritesLoaded = useExploreStore((state) => state.favoritesLoaded);
  React.useEffect(() => {
    if (!favoritesLoaded) {
      loadFavorites();
    }
  }, [favoritesLoaded, loadFavorites]);

  // Fetch podcast metadata via Lookup API
  const {
    data: podcast,
    isLoading: isLoadingPodcast,
    error: podcastError,
  } = useQuery({
    queryKey: ['podcast', 'lookup', id],
    queryFn: () => lookupPodcastFull(id),
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  // Fetch episodes via RSS feed (only when we have feedUrl)
  const {
    data: feed,
    isLoading: isLoadingFeed,
    error: feedError,
  } = useQuery({
    queryKey: ['podcast', 'feed', podcast?.feedUrl],
    queryFn: () => fetchPodcastFeed(podcast!.feedUrl),
    enabled: !!podcast?.feedUrl,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60 * 6, // 6 hours
  });

  // Find the episode from the feed
  let decodedEpisodeId = (episodeId || '').trim();
  try {
    decodedEpisodeId = decodeURIComponent(decodedEpisodeId);
  } catch {
    // Keep raw param if decoding fails.
  }

  // STEP 1: Direct ID Match (Fastest)
  let episode = feed?.episodes.find(ep => ep.id === decodedEpisodeId);

  // STEP 2: Match Recovery Strategy (If direct GUID match fails)
  // Sometimes iTunes API GUID vs RSS GUID have subtle differences or iTunes GUID is missing
  const { data: itunesEpisodes, isLoading: isLoadingItunes } = useQuery({
    queryKey: ['podcast', 'itunes-episodes', id],
    queryFn: () => lookupPodcastEpisodes(id, 'us', 50),
    enabled: !!feed && !episode, // Only run if feed is loaded but episode not found
    staleTime: 1000 * 60 * 60,
  });

  if (!episode && feed && itunesEpisodes) {
    // Try to find the metadata in iTunes results using the GUID or trackId
    const itunesMeta = itunesEpisodes.find(ep => ep.episodeGuid === decodedEpisodeId || String(ep.trackId) === decodedEpisodeId);

    if (itunesMeta) {
      // 1. Try to find in RSS feed using iTunes metadata (Title or URL match)
      episode = feed.episodes.find(ep => {
        const titleMatch = ep.title.trim().toLowerCase() === itunesMeta.trackName.trim().toLowerCase();
        const urlMatch = itunesMeta.episodeUrl && ep.audioUrl.includes(itunesMeta.episodeUrl.split('?')[0]);
        return titleMatch || urlMatch;
      });

      // 2. If STILL not in RSS (e.g. older episode dropped from RSS list), create a Virtual Episode from iTunes data
      if (!episode) {
        episode = {
          id: itunesMeta.episodeGuid || String(itunesMeta.trackId),
          title: itunesMeta.trackName,
          description: itunesMeta.description || itunesMeta.shortDescription || '',
          audioUrl: itunesMeta.episodeUrl,
          pubDate: itunesMeta.releaseDate,
          artworkUrl: itunesMeta.artworkUrl600 || itunesMeta.artworkUrl100,
          duration: itunesMeta.trackTimeMillis ? itunesMeta.trackTimeMillis / 1000 : undefined,
          // Missing in iTunes API
          descriptionHtml: undefined,
          link: undefined,
          fileSize: undefined,
          transcriptUrl: undefined,
          chaptersUrl: undefined,
        };
      }
    }
  }

  // Favorite state
  const { addFavorite, removeFavorite, isFavorited } = useExploreStore();
  const favorited = podcast && episode ? isFavorited(podcast.feedUrl, episode.audioUrl) : false;

  // Player actions
  const setAudioUrl = usePlayerStore((state) => state.setAudioUrl);
  const play = usePlayerStore((state) => state.play);

  const handlePlayEpisode = () => {
    if (!podcast || !episode) return;
    const coverArt = getDiscoveryArtworkUrl(
      episode.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100,
      600
    );
    // Pass metadata for History/Favorites consistency with Show Page
    setAudioUrl(episode.audioUrl, episode.title, coverArt, {
      description: episode.description,
      podcastTitle: podcast.collectionName,
      podcastFeedUrl: podcast.feedUrl,
      artworkUrl: coverArt,
      publishedAt: episode.pubDate ? new Date(episode.pubDate).getTime() : undefined,
      duration: episode.duration,
    });
    play();
  };

  const handleToggleFavorite = () => {
    if (!podcast || !episode) return;
    if (favorited) {
      removeFavorite(`${podcast.feedUrl}::${episode.audioUrl}`);
    } else {
      addFavorite(podcast, episode);
    }
  };

  // Loading state: Include iTunes recovery phase to prevent "Flash of Empty State"
  const isLoading = isLoadingPodcast || isLoadingFeed || (isLoadingItunes && !episode);
  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          {/* Hero skeleton */}
          <div className="flex flex-col md:flex-row gap-8 mb-10">
            <div className="w-full md:w-64 aspect-square bg-muted rounded-2xl animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-4">
              <div className="h-8 w-3/4 bg-muted rounded animate-pulse" />
              <div className="h-5 w-1/2 bg-muted rounded animate-pulse" />
              <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
              <div className="flex gap-3 pt-4">
                <div className="h-10 w-32 bg-muted rounded animate-pulse" />
                <div className="h-10 w-10 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
          {/* Description skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Error state - podcast not found
  if (podcastError || !podcast) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">{t('errorPodcastUnavailable')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state - feed error
  if (feedError) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">{t('errorFeedLoadFailed')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state - episode not found
  if (!episode) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">{t('episodeNotFound')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Get artwork URL (episode-specific or podcast fallback)
  const artworkUrl = getDiscoveryArtworkUrl(
    episode.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100,
    600
  );

  // Description handling - prioritize rich content then strip for safety
  const contentSource = episode.descriptionHtml || episode.description || '';
  const cleanDescription = stripHtml(contentSource);
  const shouldTruncateDescription = cleanDescription.length > 500;

  // Format metadata
  const relativeTime = formatRelativeTime(episode.pubDate, t);
  const duration = formatDuration(episode.duration, t);
  const fileSize = formatFileSize(episode.fileSize);

  // Build season/episode label
  let episodeLabel = '';
  if (episode.seasonNumber && episode.episodeNumber) {
    episodeLabel = `S${episode.seasonNumber} · E${episode.episodeNumber}`;
  } else if (episode.episodeNumber) {
    episodeLabel = `E${episode.episodeNumber}`;
  } else if (episode.seasonNumber) {
    episodeLabel = `S${episode.seasonNumber}`;
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div
        className="py-10 sm:py-14 max-w-screen-2xl mx-auto"
        style={{ paddingLeft: 'var(--page-margin-x)', paddingRight: 'var(--page-margin-x)' }}
      >
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* Artwork */}
          <div className="w-full md:w-64 flex-shrink-0">
            <img
              src={artworkUrl}
              alt=""
              className="w-full aspect-square rounded-2xl object-cover shadow-lg bg-muted"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Metadata */}
          <div className="flex-1 space-y-3">
            {/* Episode Title */}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {episode.title}
            </h1>

            {/* Badges Row: Season/Episode, Type, Explicit */}
            <div className="flex flex-wrap items-center gap-2">
              {episodeLabel && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary">
                  {episodeLabel}
                </span>
              )}
              {episode.episodeType === 'trailer' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {t('episodeTypeTrailer')}
                </span>
              )}
              {episode.episodeType === 'bonus' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  {t('episodeTypeBonus')}
                </span>
              )}
              {episode.explicit && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
                  <AlertTriangle size={10} />
                  {t('episodeExplicit')}
                </span>
              )}
            </div>

            {/* Podcast Name - Link to Show Page */}
            <Button
              asChild
              variant="ghost"
              className="p-0 h-auto hover:bg-transparent"
            >
              <Link
                to="/podcast/$id"
                params={{ id }}
                className="inline-block text-base font-bold text-primary hover:underline"
              >
                {podcast.collectionName}
              </Link>
            </Button>

            {/* Meta info row */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {relativeTime && (
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  <span>{relativeTime}</span>
                </div>
              )}
              {duration && (
                <div className="flex items-center gap-1.5">
                  <Clock size={14} />
                  <span>{duration}</span>
                </div>
              )}
              {fileSize && (
                <div className="flex items-center gap-1.5">
                  <HardDrive size={14} />
                  <span>{fileSize}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={handlePlayEpisode}
                className="rounded-md bg-primary hover:opacity-90 text-primary-foreground px-6 h-10 font-bold text-sm flex items-center gap-2 shadow-none transition-all active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                {t('playEpisode')}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleToggleFavorite}
                className={cn(
                  "w-10 h-10 rounded-md border-border hover:bg-muted transition-colors",
                  favorited && "text-primary"
                )}
                aria-label={favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
              >
                <Star
                  size={18}
                  className={cn("stroke-2", favorited && "fill-current")}
                />
              </Button>

              {episode.link && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-md h-10 px-4 text-sm"
                  onClick={() => openExternal(episode.link!)}
                >
                  <ExternalLink size={14} className="mr-1.5" />
                  {t('viewOriginal')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Podcasting 2.0 Features: Transcript & Chapters */}
        {(episode.transcriptUrl || episode.chaptersUrl) && (
          <div className="flex flex-wrap gap-3 mb-8">
            {episode.transcriptUrl && (
              <Button
                variant="secondary"
                size="sm"
                className="rounded-md h-9 px-4 text-sm"
                onClick={() => openExternal(episode.transcriptUrl!)}
              >
                <FileText size={14} className="mr-1.5" />
                {t('viewTranscript')}
              </Button>
            )}
            {episode.chaptersUrl && (
              <Button
                variant="secondary"
                size="sm"
                className="rounded-md h-9 px-4 text-sm"
                onClick={() => openExternal(episode.chaptersUrl!)}
              >
                <List size={14} className="mr-1.5" />
                {t('viewChapters')}
              </Button>
            )}
          </div>
        )}

        {/* Description Section */}
        {cleanDescription && (
          <section className="max-w-3xl">
            <h2 className="text-lg font-bold mb-3">{t('descriptionTitle')}</h2>
            <div className="relative">
              <div
                className={cn(
                  "text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap",
                  !isDescriptionExpanded && shouldTruncateDescription && "line-clamp-6"
                )}
              >
                {cleanDescription}
              </div>
              {shouldTruncateDescription && (
                <Button
                  variant="link"
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-sm text-primary h-auto p-0 mt-2"
                >
                  {isDescriptionExpanded ? t('showLess') : t('showMore')}
                </Button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

import type { NavigateFn } from '@tanstack/react-router';
import { DB, type Subscription, type Favorite, type PlaybackSession } from './dexieDb';
import { getDiscoveryArtworkUrl } from './imageUtils';
import type { EpisodeMetadata } from '../store/playerStore';
import type { LocalSearchResult } from '../hooks/useGlobalSearch';

export interface LocalSearchActionDeps {
    navigate: NavigateFn;
    setAudioUrl: (url: string, title: string, coverArt?: string, metadata?: EpisodeMetadata | null) => void;
    play: () => void;
    setEpisodeMetadata: (metadata: EpisodeMetadata | null) => void;
}

export async function executeLocalSearchAction(
    result: LocalSearchResult,
    deps: LocalSearchActionDeps,
): Promise<void> {
    switch (result.type) {
        case 'subscription': {
            const subscription = result.data as Subscription;
            if (subscription.collectionId) {
                deps.navigate({ to: '/podcast/$id', params: { id: subscription.collectionId } });
            } else if (subscription.title) {
                deps.navigate({ to: '/search', search: { q: subscription.title } });
            } else {
                deps.navigate({ to: '/subscriptions' });
            }
            return;
        }
        case 'favorite': {
            const favorite = result.data as Favorite;
            const artworkSource = favorite.episodeArtworkUrl || favorite.artworkUrl;
            const artwork = getDiscoveryArtworkUrl(artworkSource, 600);

            deps.setAudioUrl(favorite.audioUrl, favorite.episodeTitle, artwork, {
                description: favorite.description,
                podcastTitle: favorite.podcastTitle,
                podcastFeedUrl: favorite.feedUrl,
                artworkUrl: artwork,
                publishedAt: favorite.pubDate ? new Date(favorite.pubDate).getTime() : undefined,
                duration: favorite.duration,
            });
            deps.play();
            return;
        }
        case 'history': {
            const session = result.data as PlaybackSession;
            if (session.audioUrl) {
                deps.setAudioUrl(session.audioUrl, session.title, session.artworkUrl || '', {
                    description: session.description,
                    podcastTitle: session.podcastTitle,
                    podcastFeedUrl: session.podcastFeedUrl,
                    artworkUrl: session.artworkUrl,
                    publishedAt: session.publishedAt,
                    duration: session.duration,
                });
                deps.setEpisodeMetadata({
                    description: session.description,
                    podcastTitle: session.podcastTitle,
                    podcastFeedUrl: session.podcastFeedUrl,
                    artworkUrl: session.artworkUrl,
                    publishedAt: session.publishedAt,
                    duration: session.duration,
                });
                deps.play();
                return;
            }

            if (session.source === 'local' && session.audioId) {
                const audioBlob = await DB.getAudioBlob(session.audioId);
                if (audioBlob) {
                    const url = URL.createObjectURL(audioBlob.blob);
                    deps.setAudioUrl(url, session.title, session.artworkUrl || '');
                    deps.play();
                    return;
                }
            }

            deps.navigate({ to: '/' });
            return;
        }
        case 'file': {
            deps.navigate({ to: '/files' });
            return;
        }
    }
}

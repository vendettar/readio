// src/components/Explore/PodcastShowCard.tsx
import React from 'react';
import { DiscoveryPodcast } from '../../libs/discoveryProvider';
import { PodcastCard } from '../PodcastCard/PodcastCard';
import { useExploreStore } from '../../store/exploreStore';
import { useI18n } from '../../hooks/useI18n';
import { CirclePlus, CircleMinus } from 'lucide-react';

interface TopShowCardProps {
    podcast: DiscoveryPodcast;
    index: number;
    onPlayLatest?: (podcast: DiscoveryPodcast) => void;
    onSubscribe?: (podcast: DiscoveryPodcast) => void;
}

/**
 * 极简、高性能的卡片组件。
 */
export const PodcastShowCard = React.memo(({ podcast, index, onPlayLatest, onSubscribe }: TopShowCardProps) => {
    const { t } = useI18n();
    const subscriptions = useExploreStore((state) => state.subscriptions);

    // Check by collectionId or feedUrl
    const subscribed = subscriptions.some(s =>
        (podcast.id && s.collectionId === podcast.id) ||
        (podcast.feedUrl && s.feedUrl === podcast.feedUrl)
    );

    return (
        <PodcastCard
            id={podcast.id}
            title={podcast.name}
            subtitle={podcast.artistName}
            artworkUrl={podcast.artworkUrl100}
            rank={index + 1}
            className="flex-shrink-0 w-[var(--item-width)] snap-start"
            onPlay={onPlayLatest ? () => onPlayLatest(podcast) : undefined}
            menuItems={[
                {
                    label: subscribed ? t('unsubscribe') : t('subscribe'),
                    icon: subscribed ? <CircleMinus size={14} /> : <CirclePlus size={14} />,
                    onClick: () => onSubscribe?.(podcast),
                }
            ]}
        />
    );
});

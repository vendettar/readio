// src/components/GlobalSearch/SearchOverlay.tsx

import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Loader2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type LocalSearchResult, useGlobalSearch } from '../../hooks/useGlobalSearch'
import { useOnClickOutside } from '../../hooks/useOnClickOutside'
import discovery, { type Podcast as PodcastType, type SearchEpisode } from '../../lib/discovery'
import { formatTimestamp } from '../../lib/formatters'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { executeLocalSearchAction } from '../../lib/localSearchActions'
import { usePlayerStore } from '../../store/playerStore'
import { useSearchStore } from '../../store/searchStore'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { SearchResultItem } from './SearchResultItem'

// ========== Sub-components ==========

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-1 py-1.5 text-xxs font-medium text-muted-foreground/70 capitalize">
      {title}
    </div>
  )
}

function PodcastItem({ podcast, onClick }: { podcast: PodcastType; onClick: () => void }) {
  return (
    <SearchResultItem
      title={podcast.collectionName}
      subtitle={podcast.artistName}
      artworkUrl={getDiscoveryArtworkUrl(podcast.artworkUrl100, 60)}
      onClick={onClick}
    />
  )
}

function EpisodeItem({ episode, onClick }: { episode: SearchEpisode; onClick: () => void }) {
  const { i18n } = useTranslation()
  const language = i18n.language
  const date = episode.releaseDate
    ? formatTimestamp(new Date(episode.releaseDate).getTime(), language)
    : ''
  return (
    <SearchResultItem
      title={episode.trackName}
      extraSubtitle={date}
      artworkUrl={getDiscoveryArtworkUrl(episode.artworkUrl100, 60)}
      onClick={onClick}
    />
  )
}

function LocalItem({ item, onClick }: { item: LocalSearchResult; onClick: () => void }) {
  return (
    <SearchResultItem
      title={item.title}
      subtitle={item.subtitle}
      extraSubtitle={item.extraSubtitle}
      artworkUrl={item.artworkUrl}
      onClick={onClick}
    />
  )
}

// ========== Main Component ==========

export function SearchOverlay() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { query, isOverlayOpen, closeOverlay } = useSearchStore()
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const play = usePlayerStore((s) => s.play)
  const setEpisodeMetadata = usePlayerStore((s) => s.setEpisodeMetadata)

  // Close on click outside
  const overlayRef = useOnClickOutside<HTMLDivElement>(closeOverlay, isOverlayOpen)

  // Global search hook
  const { podcasts, episodes, local, isLoading, isEmpty } = useGlobalSearch(query, isOverlayOpen)

  const handleViewAll = () => {
    closeOverlay()
    navigate({ to: '/search', search: { q: query } })
  }

  const handlePodcastClick = (podcast: PodcastType) => {
    closeOverlay()
    navigate({ to: '/podcast/$id', params: { id: String(podcast.providerPodcastId) } })
  }

  const handleEpisodeClick = async (episode: SearchEpisode) => {
    closeOverlay()

    let feedUrl = episode.feedUrl
    if (!feedUrl) {
      const fullPodcast = await discovery.getPodcast(episode.providerPodcastId.toString())
      feedUrl = fullPodcast?.feedUrl
    }

    if (!feedUrl) {
      navigate({ to: '/podcast/$id', params: { id: String(episode.providerPodcastId) } })
      return
    }

    const artwork = getDiscoveryArtworkUrl(episode.artworkUrl600 || episode.artworkUrl100, 600)
    setAudioUrl(episode.episodeUrl, episode.trackName, artwork, {
      description: episode.description,
      podcastTitle: episode.collectionName,
      podcastFeedUrl: feedUrl,
      artworkUrl: artwork,
      publishedAt: episode.releaseDate ? new Date(episode.releaseDate).getTime() : undefined,
      duration: episode.trackTimeMillis ? Math.round(episode.trackTimeMillis / 1000) : undefined,
    })
    play()
  }

  const handleLocalClick = (item: LocalSearchResult) => {
    closeOverlay()
    void executeLocalSearchAction(item, {
      navigate,
      setAudioUrl,
      play,
      setEpisodeMetadata,
    })
  }

  if (!isOverlayOpen || !query) return null

  const hasResults = podcasts.length > 0 || episodes.length > 0 || local.length > 0

  return (
    <div
      ref={overlayRef}
      className="absolute top-full left-4 -mt-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200 w-96"
    >
      <Card className="shadow-lg border-border overflow-hidden bg-card dark:bg-card/95">
        <CardContent className="p-1.5 max-h-[70vh] overflow-y-auto scrollbar-none">
          {/* Loading state */}
          {isLoading && !hasResults && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">{t('searchSearching')}</span>
            </div>
          )}

          {/* Empty state */}
          {isEmpty && !isLoading && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">{t('searchNoResults')}</p>
            </div>
          )}

          {/* Suggestions - Top podcast names as autocomplete */}
          {podcasts.length > 0 && (
            <div className="mb-2">
              {podcasts.slice(0, 3).map((podcast) => {
                // Highlight matching query in suggestion
                const name = podcast.collectionName
                const lowerName = name.toLowerCase()
                const lowerQuery = query.toLowerCase()
                const matchIndex = lowerName.indexOf(lowerQuery)

                let content
                if (matchIndex >= 0 && query.length > 0) {
                  const before = name.slice(0, matchIndex)
                  const match = name.slice(matchIndex, matchIndex + query.length)
                  const after = name.slice(matchIndex + query.length)
                  content = (
                    <>
                      <span className="text-muted-foreground/60">{before}</span>
                      <span className="text-foreground">{match}</span>
                      <span className="text-muted-foreground/60">{after}</span>
                    </>
                  )
                } else {
                  content = <span className="text-muted-foreground/60">{name}</span>
                }

                return (
                  <Button
                    key={`suggest-${podcast.providerPodcastId}`}
                    variant="ghost"
                    onClick={() => handlePodcastClick(podcast)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors text-left justify-start h-auto"
                  >
                    <Search className="w-2.5 h-2.5 text-muted-foreground/50 flex-shrink-0" />
                    <span className="text-xs truncate">{content}</span>
                  </Button>
                )
              })}
            </div>
          )}

          {/* Local Results (Your Library) */}
          {local.length > 0 && (
            <div className="mb-2">
              <SectionHeader title={t('searchYourLibrary')} />
              {local.map((item) => (
                <LocalItem key={item.id} item={item} onClick={() => handleLocalClick(item)} />
              ))}
            </div>
          )}

          {/* Podcasts */}
          {podcasts.length > 0 && (
            <div className="mb-2">
              <SectionHeader title={t('searchPodcasts')} />
              {podcasts.slice(0, 3).map((podcast) => (
                <PodcastItem
                  key={podcast.providerPodcastId}
                  podcast={podcast}
                  onClick={() => handlePodcastClick(podcast)}
                />
              ))}
            </div>
          )}

          {/* Episodes */}
          {episodes.length > 0 && (
            <div className="mb-2">
              <SectionHeader title={t('searchEpisodes')} />
              {episodes.slice(0, 5).map((episode) => (
                <EpisodeItem
                  key={episode.providerEpisodeId}
                  episode={episode}
                  onClick={() => handleEpisodeClick(episode)}
                />
              ))}
            </div>
          )}

          {/* View All Button */}
          {hasResults && (
            <Button
              variant="ghost"
              onClick={handleViewAll}
              className="w-full mt-1 pt-2 justify-center text-sm font-medium text-primary h-auto rounded-none"
            >
              {t('searchViewAll')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

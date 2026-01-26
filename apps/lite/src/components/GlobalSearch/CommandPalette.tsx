import { useNavigate } from '@tanstack/react-router'
import { Command as CommandPrimitive } from 'cmdk'
import { ArrowRight, Clock, Folder, LayoutGrid, Search, Star } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { type LocalSearchResult, useGlobalSearch } from '../../hooks/useGlobalSearch'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useOnClickOutside } from '../../hooks/useOnClickOutside'
import discovery, { type Podcast as PodcastType, type SearchEpisode } from '../../lib/discovery'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { executeLocalSearchAction } from '../../lib/localSearchActions'
import { getAppConfig } from '../../lib/runtimeConfig'
import { cn } from '../../lib/utils'
import { usePlayerStore } from '../../store/playerStore'
import { useSearchStore } from '../../store/searchStore'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../ui/command'

export function CommandPalette() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const query = useSearchStore((s) => s.query)
  const setQuery = useSearchStore((s) => s.setQuery)
  const isOverlayOpen = useSearchStore((s) => s.isOverlayOpen)
  const openOverlay = useSearchStore((s) => s.openOverlay)
  const closeOverlay = useSearchStore((s) => s.closeOverlay)
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const play = usePlayerStore((s) => s.play)
  const setEpisodeMetadata = usePlayerStore((s) => s.setEpisodeMetadata)
  const { isOnline } = useNetworkStatus()
  const config = getAppConfig()
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when overlay opens
  useEffect(() => {
    if (isOverlayOpen) {
      // Small timeout to ensure visibility animation has started
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      inputRef.current?.blur()
    }
  }, [isOverlayOpen])

  // Close when clicking outside the component
  const containerRef = useOnClickOutside<HTMLDivElement>(() => {
    if (isOverlayOpen) closeOverlay()
  }, isOverlayOpen)

  const { podcasts, episodes, local, isLoading, isEmpty } = useGlobalSearch(query, isOverlayOpen)

  const handleSelectPodcast = (podcast: PodcastType) => {
    closeOverlay()
    navigate({ to: '/podcast/$id', params: { id: String(podcast.providerPodcastId) } })
  }

  const handleSelectEpisode = async (episode: SearchEpisode) => {
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

  const handleSelectLocal = (item: LocalSearchResult) => {
    closeOverlay()
    void executeLocalSearchAction(item, {
      navigate,
      setAudioUrl,
      play,
      setEpisodeMetadata,
    })
  }

  const handleViewAll = () => {
    closeOverlay()
    navigate({ to: '/search', search: { q: query } })
  }

  const getLocalIcon = (type: LocalSearchResult['type']) => {
    switch (type) {
      case 'subscription':
        return <LayoutGrid className="h-4 w-4" />
      case 'favorite':
        return <Star className="h-4 w-4" />
      case 'history':
        return <Clock className="h-4 w-4" />
      case 'file':
        return <Folder className="h-4 w-4" />
      default:
        return <Search className="h-4 w-4" />
    }
  }

  return (
    <div ref={containerRef} className="relative w-full px-4 pb-4">
      <Command shouldFilter={false} className="overflow-visible bg-transparent h-auto rounded-md">
        {/* The Search Box - acts as common input and cmdk input */}
        <div
          className={cn(
            'relative flex items-center w-full px-3 h-10 bg-muted/50 border border-border rounded-md transition-all group',
            isOverlayOpen && 'ring-2 ring-primary border-primary bg-background shadow-md'
          )}
        >
          <Search
            className={cn(
              'mr-2 h-4 w-4 text-muted-foreground transition-colors',
              isOverlayOpen && 'text-primary'
            )}
          />

          <CommandPrimitive.Input
            ref={inputRef}
            placeholder={t('searchPlaceholderGlobal')}
            value={query}
            onFocus={() => openOverlay()}
            onValueChange={setQuery}
            onKeyDown={(event: React.KeyboardEvent) => {
              if (event.key === 'Escape') {
                closeOverlay()
                inputRef.current?.blur()
              }
            }}
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground h-full"
          />

          {!isOverlayOpen && !query && (
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xxs font-medium opacity-100 sm:flex ml-2">
              <span className="text-xs text-muted-foreground/50">⌘</span>
              <span className="text-muted-foreground/70">K</span>
            </kbd>
          )}
        </div>

        {/* Floating Results Panel */}
        <div
          className={cn(
            'absolute left-4 w-search-palette max-w-search-palette top-full -mt-4 z-overlay overflow-hidden rounded-xl border border-border/50 bg-popover/95 backdrop-blur-xl backdrop-saturate-150 shadow-2xl transition-all duration-200 origin-top',
            isOverlayOpen
              ? 'opacity-100 translate-y-2 scale-100 pointer-events-auto'
              : 'opacity-0 translate-y-1 scale-95 pointer-events-none'
          )}
        >
          <CommandList className="scrollbar-none max-h-search-results p-1">
            {isLoading && (
              <div className="py-6 text-center text-sm text-muted-foreground animate-pulse">
                {t('searchSearching')}
              </div>
            )}

            {isEmpty && !isLoading && query.length >= 2 && (
              <CommandEmpty className="py-10 text-center">
                <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t('searchNoResults')}</p>
              </CommandEmpty>
            )}

            {/* Suggestions - Direct matches */}
            {isOnline && podcasts.length > 0 && query.length >= 2 && (
              <CommandGroup>
                {podcasts.slice(0, config.SEARCH_SUGGESTIONS_LIMIT).map((podcast) => (
                  <CommandItem
                    key={`suggest-${podcast.providerPodcastId}`}
                    onSelect={() => handleSelectPodcast(podcast)}
                    className="flex items-center py-1 px-3 rounded-md hover:bg-accent cursor-pointer"
                  >
                    <Search className="mr-2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
                    <span className="text-xs truncate">{podcast.collectionName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Local Library */}
            {local.length > 0 && (
              <CommandGroup heading={t('searchYourLibrary')}>
                {local.map((item, index) => (
                  <CommandItem
                    key={item.id}
                    onSelect={() => handleSelectLocal(item)}
                    className="relative py-1.5 px-3 rounded-md flex items-center gap-3 hover:bg-accent cursor-pointer smart-divider-group group/search-item"
                  >
                    {index === 0 && (
                      <div className="absolute top-0 left-3 right-3 h-px bg-border transition-opacity duration-200 smart-divider group-hover/search-item:opacity-0" />
                    )}
                    <div className="h-8 w-8 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                      {item.artworkUrl ? (
                        <img
                          src={getDiscoveryArtworkUrl(item.artworkUrl, 80)}
                          alt=""
                          className="block h-full w-full object-cover"
                        />
                      ) : (
                        getLocalIcon(item.type)
                      )}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-xs font-light truncate">{item.title}</span>
                      <span className="text-xxs text-muted-foreground truncate">
                        {item.subtitle}
                      </span>
                    </div>

                    <div className="flex gap-1.5 flex-shrink-0 items-center ml-2">
                      {item.badges.map((badge) => (
                        <span key={badge} className="text-primary transition-colors">
                          {badge === 'subscription' && <LayoutGrid className="h-3 w-3" />}
                          {badge === 'favorite' && <Star className="h-3 w-3 fill-current" />}
                          {badge === 'history' && <Clock className="h-3 w-3" />}
                          {badge === 'file' && <Folder className="h-3 w-3" />}
                        </span>
                      ))}
                    </div>
                    <div className="absolute bottom-0 left-3 right-3 h-px bg-border transition-opacity duration-200 smart-divider group-hover/search-item:opacity-0" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Podcasts Results */}
            {isOnline && podcasts.length > 0 && (
              <>
                <CommandSeparator className="my-1" />
                <CommandGroup heading={t('searchPodcasts')}>
                  {podcasts.slice(0, config.SEARCH_PODCASTS_LIMIT).map((podcast, index) => (
                    <CommandItem
                      key={`podcast-${podcast.providerPodcastId}`}
                      onSelect={() => handleSelectPodcast(podcast)}
                      className="relative py-1.5 px-3 rounded-md flex items-center gap-3 hover:bg-accent cursor-pointer smart-divider-group group/search-item"
                    >
                      {index === 0 && (
                        <div className="absolute top-0 left-3 right-3 h-px bg-border transition-opacity duration-200 smart-divider group-hover/search-item:opacity-0" />
                      )}
                      <img
                        src={getDiscoveryArtworkUrl(podcast.artworkUrl100, 80)}
                        alt=""
                        className="block h-10 w-10 rounded-md object-cover shadow-sm bg-muted"
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs font-light truncate">
                          {podcast.collectionName}
                        </span>
                        <span className="text-xxs text-muted-foreground truncate">
                          {podcast.artistName}
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-3 right-3 h-px bg-border transition-opacity duration-200 smart-divider group-hover/search-item:opacity-0" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Episodes Results */}
            {isOnline && episodes.length > 0 && (
              <>
                <CommandSeparator className="my-1" />
                <CommandGroup heading={t('searchEpisodes')}>
                  {episodes.slice(0, config.SEARCH_EPISODES_LIMIT).map((episode, index) => (
                    <CommandItem
                      key={`episode-${episode.providerEpisodeId}`}
                      onSelect={() => handleSelectEpisode(episode)}
                      className="relative py-1.5 px-3 rounded-md flex items-center gap-3 hover:bg-accent cursor-pointer smart-divider-group group/search-item"
                    >
                      {index === 0 && (
                        <div className="absolute top-0 left-3 right-3 h-px bg-border transition-opacity duration-200 smart-divider group-hover/search-item:opacity-0" />
                      )}
                      <img
                        src={getDiscoveryArtworkUrl(episode.artworkUrl100, 80)}
                        alt=""
                        className="block h-10 w-10 rounded-md object-cover shadow-sm bg-muted"
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs font-light truncate">{episode.trackName}</span>
                        <span className="text-xxs text-muted-foreground truncate">
                          {episode.collectionName}
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-3 right-3 h-px bg-border transition-opacity duration-200 smart-divider group-hover/search-item:opacity-0" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* View All Footer */}
            {query.length >= 2 &&
              (local.length > 0 || podcasts.length > 0 || episodes.length > 0) && (
                <>
                  <CommandSeparator className="my-1" />
                  <CommandItem
                    onSelect={handleViewAll}
                    className="justify-center text-primary py-0.5 font-medium rounded-md hover:bg-accent cursor-pointer"
                  >
                    {t('searchViewAll')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </CommandItem>
                </>
              )}
          </CommandList>
        </div>
      </Command>
    </div>
  )
}

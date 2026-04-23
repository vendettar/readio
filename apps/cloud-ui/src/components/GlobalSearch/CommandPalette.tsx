import { useNavigate } from '@tanstack/react-router'
import { Clock, Download, Folder, LayoutGrid, Search, Star } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LocalSearchResult, useGlobalSearch } from '../../hooks/useGlobalSearch'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import type { SearchPodcast as PodcastType, SearchEpisode } from '../../lib/discovery'
import { buildEpisodeCompactKey } from '../../lib/discovery/editorPicks'
import { executeLocalSearchAction } from '../../lib/localSearchActions'
import {
  buildPodcastEpisodeRoute,
  buildPodcastShowRoute,
  normalizeCountryParam,
} from '../../lib/routes/podcastRoutes'
import { getAppConfig } from '../../lib/runtimeConfig'
import { cn } from '../../lib/utils'
import { useExploreStore } from '../../store/exploreStore'
import { usePlayerStore } from '../../store/playerStore'
import { usePlayerSurfaceStore } from '../../store/playerSurfaceStore'
import { useSearchStore } from '../../store/searchStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'

// Helper component for highlighting text matches
function HighlightedSuggestion({ text, highlight }: { text: string; highlight: string }) {
  const trimmedQuery = highlight.trim()
  if (!trimmedQuery) {
    return <span className="text-xs truncate text-muted-foreground">{text}</span>
  }

  // Split query into individual words and filter out empty strings
  const words = trimmedQuery.split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return <span className="text-xs truncate text-muted-foreground">{text}</span>
  }

  // Create a regex pattern that matches any of the words: (word1|word2|...)
  // We sort words by length descending to ensure we match the longest possible sequences first
  const sortedWords = [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = `(${sortedWords.join('|')})`
  const regex = new RegExp(pattern, 'gi')

  const parts = text.split(regex)

  return (
    <span className="text-xs truncate text-muted-foreground">
      {parts.map((part, i) => {
        // Check if this part matches any of our original search words
        const isMatch = words.some((w) => part.toLowerCase() === w.toLowerCase())
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are stable for a given text
          <span key={i} className={isMatch ? 'text-foreground font-medium' : ''}>
            {part}
          </span>
        )
      })}
    </span>
  )
}

function getLocalIcon(type: LocalSearchResult['type']) {
  switch (type) {
    case 'subscription':
      return <LayoutGrid className="h-4 w-4" />
    case 'favorite':
      return <Star className="h-4 w-4" />
    case 'history':
      return <Clock className="h-4 w-4" />
    case 'file':
      return <Folder className="h-4 w-4" />
    case 'download':
      return <Download className="h-4 w-4" />
    default:
      return <Search className="h-4 w-4" />
  }
}

function LocalItemArtwork({ item }: { item: LocalSearchResult }) {
  if (!item.artworkUrl && !item.artworkBlob) {
    return (
      <div className="h-8 w-8 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
        {getLocalIcon(item.type)}
      </div>
    )
  }

  return (
    <InteractiveArtwork
      src={item.artworkUrl}
      blob={item.artworkBlob}
      imageSize={80}
      size="sm"
      className="h-8 w-8 flex-shrink-0"
    />
  )
}

export function CommandPalette() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const query = useSearchStore((s) => s.query)
  const setQuery = useSearchStore((s) => s.setQuery)
  const isOverlayOpen = useSearchStore((s) => s.isOverlayOpen)
  const openOverlay = useSearchStore((s) => s.openOverlay)
  const closeOverlay = useSearchStore((s) => s.closeOverlay)
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const loadAudioBlob = usePlayerStore((s) => s.loadAudioBlob)
  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const setSubtitles = useTranscriptStore((s) => s.setSubtitles)
  const setSessionId = usePlayerStore((s) => s.setSessionId)
  const setPlaybackTrackId = usePlayerStore((s) => s.setPlaybackTrackId)
  const toMini = usePlayerSurfaceStore((s) => s.toMini)
  const globalCountry = normalizeCountryParam(useExploreStore((s) => s.country))
  const { isOnline } = useNetworkStatus()
  const config = getAppConfig()
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const panelId = 'global-search-command-panel'
  const defaultSearchActionValue = query.length >= 2 ? `search-global-dummy-${query}` : ''
  const [selectedValue, setSelectedValue] = useState(defaultSearchActionValue)
  const clearHoverSelection = useCallback(() => {
    setSelectedValue((prev) =>
      prev === defaultSearchActionValue ? prev : defaultSearchActionValue
    )
  }, [defaultSearchActionValue])
  const clearSelectionOnNonItemHover = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (target.closest('[cmdk-item]')) {
        return
      }
      clearHoverSelection()
    },
    [clearHoverSelection]
  )

  // Focus management: Capture previous focus context for the current open session
  useEffect(() => {
    if (isOverlayOpen) {
      if (typeof document !== 'undefined') {
        const active = document.activeElement as HTMLElement

        // Must reset for every new open cycle to ensure we don't carry
        // a stale restore target from a prior unrelated session.
        previousFocusRef.current = null

        // Only capture focus if it's currently outside the search scope (e.g. shortcut trigger)
        if (active && active !== inputRef.current && !anchorRef.current?.contains(active)) {
          previousFocusRef.current = active
        }
      }
      inputRef.current?.focus()
    }
  }, [isOverlayOpen])

  // Separate effect for ephemeral selection state
  useEffect(() => {
    if (isOverlayOpen) {
      setSelectedValue(defaultSearchActionValue)
    }
  }, [isOverlayOpen, defaultSearchActionValue])

  useEffect(() => {
    setSelectedValue(defaultSearchActionValue)
  }, [defaultSearchActionValue])

  const { podcasts, episodes, local, isLoading, isEmpty } = useGlobalSearch(query, isOverlayOpen)
  const suggestions = useMemo(() => {
    const seen = new Set<string>()
    return podcasts
      .filter((p) => {
        const lowerName = (p.title || '').toLowerCase().trim()
        if (seen.has(lowerName)) return false
        seen.add(lowerName)
        return true
      })
      .slice(0, config.SEARCH_SUGGESTIONS_LIMIT)
  }, [podcasts, config.SEARCH_SUGGESTIONS_LIMIT])

  // Only show the floating panel if there's a query or content to display
  const hasContent =
    query.length >= 2 &&
    (isLoading || local.length > 0 || podcasts.length > 0 || episodes.length > 0)
  const shouldShowPanel = isOverlayOpen && hasContent

  const handleSelectPodcast = (podcast: PodcastType) => {
    closeOverlay()
    toMini()
    const podcastId = podcast.podcastItunesId
    if (!podcastId) return
    const showRoute = buildPodcastShowRoute({
      country: globalCountry,
      podcastId: String(podcastId),
    })
    if (showRoute) {
      void navigate(showRoute)
    }
  }

  const handleSelectEpisode = async (episode: SearchEpisode) => {
    closeOverlay()
    toMini()
    const podcastId = episode.podcastItunesId?.toString()

    if (!podcastId) return

    const episodeIdentity = episode.episodeGuid?.trim()
    if (!episodeIdentity) {
      const showRoute = buildPodcastShowRoute({ country: globalCountry, podcastId })
      if (showRoute) {
        void navigate(showRoute)
      }
      return
    }

    const episodeKey = buildEpisodeCompactKey(episodeIdentity)
    if (!episodeKey) {
      const showRoute = buildPodcastShowRoute({ country: globalCountry, podcastId })
      if (showRoute) {
        void navigate(showRoute)
      }
      return
    }

    const episodeRoute = buildPodcastEpisodeRoute({
      country: globalCountry,
      podcastId,
      episodeKey,
    })
    if (episodeRoute) {
      void navigate(episodeRoute)
    }
  }

  const handleSelectLocal = (item: LocalSearchResult) => {
    closeOverlay()
    toMini()
    void executeLocalSearchAction(item, {
      navigate,
      setAudioUrl,
      loadAudioBlob,
      play,
      pause,
      setSubtitles,
      setSessionId,
      setPlaybackTrackId,
    })
  }

  const handleViewAll = () => {
    closeOverlay()
    toMini()
    void navigate({ to: '/search', search: { q: query } })
  }

  return (
    <search className="relative w-full px-4 pb-2">
      <Popover
        open={isOverlayOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeOverlay()
          }
        }}
      >
        <Command
          shouldFilter={false}
          loop
          value={selectedValue}
          onValueChange={(value) => {
            setSelectedValue(value || defaultSearchActionValue)
          }}
          className="overflow-visible bg-transparent h-auto rounded-md"
        >
          <PopoverAnchor asChild>
            {/* The Search Box - acts as common input and cmdk input */}
            <div
              ref={anchorRef}
              data-testid="command-palette-anchor"
              className={cn(
                'relative flex items-center w-full px-3 h-10 bg-muted/50 border border-border rounded-md transition-all group cursor-text',
                isOverlayOpen && 'ring-2 ring-primary border-primary bg-background shadow-md'
              )}
            >
              <Search
                className={cn(
                  'me-2 h-4 w-4 text-muted-foreground transition-colors',
                  isOverlayOpen && 'text-primary'
                )}
              />

              <CommandInput
                ref={inputRef as unknown as React.Ref<never>}
                data-testid="command-input"
                hideIcon
                wrapperClassName="flex-1 border-none px-0 h-full"
                placeholder={t('searchPlaceholderGlobal')}
                value={query}
                onFocus={() => openOverlay()}
                onMouseEnter={clearHoverSelection}
                onValueChange={setQuery}
                aria-label={t('searchPlaceholderGlobal')}
                aria-expanded={isOverlayOpen}
                aria-controls={panelId}
                aria-haspopup="listbox"
                onKeyDown={(event: React.KeyboardEvent) => {
                  if (event.key === 'Escape') {
                    closeOverlay()
                  }
                }}
                className="flex-1 h-full bg-transparent py-0 text-sm placeholder:text-muted-foreground"
              />

              {!isOverlayOpen && !query && (
                <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xxs font-medium opacity-100 sm:flex ms-2">
                  <span className="text-xs text-muted-foreground/50">⌘</span>
                  <span className="text-muted-foreground/70">K</span>
                </kbd>
              )}
            </div>
          </PopoverAnchor>

          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => {
              const target = previousFocusRef.current
              const isTargetValid = target && document.body.contains(target)

              if (isTargetValid) {
                // Path B: Restore to previous active element
                target.focus()
                previousFocusRef.current = null
                event.preventDefault()
              } else if (target) {
                // Path A Fallback: A real previous target existed but is gone,
                // so restore to a safe in-scope fallback instead of reclaiming focus
                // for sessions that started by directly focusing the input.
                const input = anchorRef.current?.querySelector('input')
                if (input && document.body.contains(input)) {
                  input.focus()
                  event.preventDefault()
                }
                previousFocusRef.current = null
              }
              // Otherwise, allow Radix default (return to trigger)
            }}
            onInteractOutside={(event) => {
              const target = event.target
              if (target instanceof Node && anchorRef.current?.contains(target)) {
                event.preventDefault()
              }
            }}
            onFocusOutside={(event) => {
              const target = event.target
              if (target instanceof Node && anchorRef.current?.contains(target)) {
                event.preventDefault()
              }
            }}
            onMouseOver={clearSelectionOnNonItemHover}
            onMouseLeave={clearHoverSelection}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeOverlay()
              }
            }}
            className={cn(
              'w-search-palette max-w-search-palette max-h-search-results z-overlay overflow-hidden rounded-xl border border-border/50 bg-popover/95 p-0 backdrop-blur-xl backdrop-saturate-150 shadow-2xl transition-all duration-200 origin-top',
              shouldShowPanel
                ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'
            )}
          >
            <CommandList id={panelId} className="scrollbar-none max-h-search-results p-1">
              {isLoading && (
                <div className="py-6 text-center text-sm text-muted-foreground animate-pulse">
                  {t('searchSearching')}
                </div>
              )}

              {/* Default "Search for..." action - auto-selected to support Enter -> Search Page */}
              {
                /* Invisible Default Action - captures Enter key to trigger search page */
                query.length >= 2 && (
                  <CommandItem
                    value={`search-global-dummy-${query}`}
                    onSelect={handleViewAll}
                    className="h-0 p-0 overflow-hidden opacity-0 pointer-events-none data-[disabled=true]:h-0"
                  />
                )
              }

              {isEmpty && !isLoading && query.length >= 2 && (
                <CommandEmpty className="py-10 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('searchNoResults')}</p>
                </CommandEmpty>
              )}

              {/* Suggestions - Direct matches */}
              {isOnline && suggestions.length > 0 && query.length >= 2 && (
                <CommandGroup>
                  {suggestions.map((podcast: PodcastType) => (
                    <CommandItem
                      key={`suggest-${podcast.podcastItunesId}`}
                      value={`suggest-${podcast.podcastItunesId}`}
                      onSelect={() => handleSelectPodcast(podcast)}
                      className="flex items-center py-1 px-3 rounded-md hover:bg-primary hover:text-primary-foreground aria-selected:bg-primary aria-selected:text-primary-foreground data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground cursor-pointer"
                    >
                      <Search className="me-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <HighlightedSuggestion text={podcast.title || ''} highlight={query} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {/* Local Library */}
              {local.length > 0 && (
                <CommandGroup heading={t('searchYourLibrary')}>
                  {local.map((item, index, arr) => (
                    <CommandItem
                      key={item.id}
                      value={`local-${item.id}`}
                      onSelect={() => handleSelectLocal(item)}
                      className="relative py-1.5 px-3 rounded-md flex items-center gap-3 hover:bg-primary hover:text-primary-foreground hover:[&_.text-muted-foreground]:text-primary-foreground/80 aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:[&_.text-muted-foreground]:text-primary-foreground/80 data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:[&_.text-muted-foreground]:text-primary-foreground/80 cursor-pointer group/search-item -mt-px hover:z-10 aria-selected:z-10 data-[selected=true]:z-10"
                    >
                      <LocalItemArtwork item={item} />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs font-light truncate">{item.title}</span>
                        <span className="text-xxs text-muted-foreground truncate">
                          {item.subtitle}
                        </span>
                      </div>

                      <div className="flex gap-1.5 flex-shrink-0 items-center ms-2">
                        {item.badges.map((badge) => (
                          <span key={badge} className="text-primary transition-colors">
                            {badge === 'subscription' && <LayoutGrid className="h-3 w-3" />}
                            {badge === 'favorite' && <Star className="h-3 w-3 fill-current" />}
                            {badge === 'history' && <Clock className="h-3 w-3" />}
                            {badge === 'file' && <Folder className="h-3 w-3" />}
                          </span>
                        ))}
                      </div>
                      {index < arr.length - 1 && (
                        <div className="absolute bottom-0 start-3 end-3 h-px bg-border smart-divider smart-divider-bottom" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {/* Podcasts Results */}
              {isOnline && podcasts.length > 0 && (
                <>
                  <CommandSeparator className="my-1" />
                  <CommandGroup heading={t('searchPodcasts')}>
                    {podcasts.slice(0, config.SEARCH_PODCASTS_LIMIT).map((podcast, index, arr) => (
                      <CommandItem
                        key={`podcast-${podcast.podcastItunesId}`}
                        value={`podcast-${podcast.podcastItunesId}`}
                        onSelect={() => handleSelectPodcast(podcast)}
                        className="relative py-1.5 px-3 rounded-md flex items-center gap-3 hover:bg-primary hover:text-primary-foreground hover:[&_.text-muted-foreground]:text-primary-foreground/80 aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:[&_.text-muted-foreground]:text-primary-foreground/80 data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:[&_.text-muted-foreground]:text-primary-foreground/80 cursor-pointer group/search-item -mt-px hover:z-10 aria-selected:z-10 data-[selected=true]:z-10"
                      >
                        <InteractiveArtwork
                          src={podcast.artwork}
                          imageSize={80}
                          size="sm"
                          className="h-10 w-10 shadow-sm"
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-xs font-light truncate">{podcast.title}</span>
                          <span className="text-xxs text-muted-foreground truncate">
                            {podcast.author}
                          </span>
                        </div>
                        {index < arr.length - 1 && (
                          <div className="absolute bottom-0 start-3 end-3 h-px bg-border smart-divider smart-divider-bottom" />
                        )}
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
                    {episodes.slice(0, config.SEARCH_EPISODES_LIMIT).map((episode, index, arr) => {
                      const episodeKey = episode.episodeUrl
                      return (
                        <CommandItem
                          key={`episode-${episodeKey}`}
                          value={`episode-${episodeKey}`}
                          onSelect={() => handleSelectEpisode(episode)}
                          className="relative py-1.5 px-3 rounded-md flex items-center gap-3 hover:bg-primary hover:text-primary-foreground hover:[&_.text-muted-foreground]:text-primary-foreground/80 aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:[&_.text-muted-foreground]:text-primary-foreground/80 data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:[&_.text-muted-foreground]:text-primary-foreground/80 cursor-pointer group/search-item -mt-px hover:z-10 aria-selected:z-10 data-[selected=true]:z-10"
                        >
                          <InteractiveArtwork
                            src={episode.artwork}
                            imageSize={80}
                            size="sm"
                            className="h-10 w-10 shadow-sm"
                          />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-xs font-light truncate">{episode.title}</span>
                            <span className="text-xxs text-muted-foreground truncate">
                              {episode.showTitle}
                            </span>
                          </div>
                          {index < arr.length - 1 && (
                            <div className="absolute bottom-0 start-3 end-3 h-px bg-border smart-divider smart-divider-bottom" />
                          )}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </>
              )}

              {/* View All Footer */}
            </CommandList>
          </PopoverContent>
        </Command>
      </Popover>
    </search>
  )
}

import { useNavigate, useSearch } from '@tanstack/react-router'
import { CircleMinus, CirclePlus, Library, Loader2, Mic2, Podcast, Search } from 'lucide-react'
import React from 'react'
import { SearchEpisodeItem } from '../components/GlobalSearch/SearchEpisodeItem'
import { SearchResultItem } from '../components/GlobalSearch/SearchResultItem'
import { PodcastCard } from '../components/PodcastCard/PodcastCard'
import { useEpisodePlayback } from '../hooks/useEpisodePlayback'
import { type LocalSearchResult, useGlobalSearch } from '../hooks/useGlobalSearch'
import { useI18n } from '../hooks/useI18n'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { lookupPodcastFull, type SearchEpisode } from '../libs/discoveryProvider'
import { executeLocalSearchAction } from '../libs/localSearchActions'
import { toast } from '../libs/toast'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'

export default function SearchPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { q: query = '' } = useSearch({ from: '/search' })
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const play = usePlayerStore((s) => s.play)
  const setEpisodeMetadata = usePlayerStore((s) => s.setEpisodeMetadata)
  const subscribe = useExploreStore((s) => s.subscribe)
  const unsubscribe = useExploreStore((s) => s.unsubscribe)
  const isSubscribed = useExploreStore((s) => s.isSubscribed)

  // Keyboard shortcuts
  useKeyboardShortcuts({ isModalOpen: false })

  // Load subscriptions/favorites on mount to ensure UI state is correct
  const loadSubscriptions = useExploreStore((s) => s.loadSubscriptions)
  const loadFavorites = useExploreStore((s) => s.loadFavorites)
  const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded)

  React.useEffect(() => {
    if (!subscriptionsLoaded) {
      loadSubscriptions()
    }
  }, [subscriptionsLoaded, loadSubscriptions])

  React.useEffect(() => {
    const checkFavorites = async () => {
      // useExploreStore handles the 'loaded' flag internally,
      // but it's safer to just call it if we need fresh data
      await loadFavorites()
    }
    checkFavorites()
  }, [loadFavorites])

  // Search results
  const { playSearchEpisode } = useEpisodePlayback()

  const { podcasts, episodes, local, isLoading, isEmpty } = useGlobalSearch(query, true, {
    subscriptionLimit: Infinity,
    favoriteLimit: Infinity,
    historyLimit: Infinity,
    fileLimit: Infinity,
  })

  // Handler for direct playback from artwork (Fast)
  const handlePlaySearchEpisode = async (episode: SearchEpisode) => {
    if (!episode.episodeUrl) return

    // Optimization: Feed URL is now available in SearchEpisode (entity=podcastEpisode)!
    // Only lookup if it's missing (e.g. from a hypothetical source that lacks it)
    let podcastFeedUrl = episode.feedUrl
    if (!podcastFeedUrl) {
      const fullPodcast = await lookupPodcastFull(episode.collectionId.toString())
      podcastFeedUrl = fullPodcast?.feedUrl
    }

    if (!podcastFeedUrl) {
      toast.error(t('errorPodcastFeedNotFound'))
      navigate({ to: '/podcast/$id', params: { id: episode.collectionId.toString() } })
      return
    }

    playSearchEpisode(episode, podcastFeedUrl)
  }

  const handleSelectLocalResult = (result: LocalSearchResult) => {
    void executeLocalSearchAction(result, {
      navigate,
      setAudioUrl,
      play,
      setEpisodeMetadata,
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-5xl mx-auto px-[var(--page-gutter-x)] pt-4 pb-8">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground tracking-tight mb-3">
            {query ? `"${query}"` : t('searchPlaceholderGlobal')}
          </h1>
          {query && (
            <p className="text-xl text-muted-foreground font-medium">
              {t('searchResultsCount', { count: podcasts.length + episodes.length + local.length })}
            </p>
          )}
        </header>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-lg text-muted-foreground">{t('searchSearching')}</span>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && !isLoading && query && (
          <div className="mt-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
              <Search className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">{t('searchNoResults')}</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">{t('searchEmptyHint')}</p>
          </div>
        )}

        {/* No query state */}
        {!query && (
          <div className="mt-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
              <Search className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">{t('searchEmptyTitle')}</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">{t('searchEmptyBody')}</p>
          </div>
        )}

        {/* Results */}
        {!isLoading && query && (
          <div className="space-y-12">
            {/* Local Library Results */}
            {local.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Library className="w-5 h-5" />
                  {t('searchInLibrary')}
                </h2>
                <div className="space-y-2">
                  {local.map((result) => (
                    <SearchResultItem
                      key={result.id}
                      title={result.title}
                      subtitle={result.subtitle}
                      extraSubtitle={result.extraSubtitle}
                      artworkUrl={result.artworkUrl}
                      onClick={() => handleSelectLocalResult(result)}
                      className="py-3"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Podcasts Section */}
            {podcasts.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Podcast className="w-5 h-5" />
                  {t('searchPodcasts')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {podcasts.map((podcast) => {
                    const subscribed = podcast.feedUrl ? isSubscribed(podcast.feedUrl) : false
                    return (
                      <PodcastCard
                        key={podcast.collectionId}
                        id={String(podcast.collectionId)}
                        title={podcast.collectionName}
                        subtitle={podcast.artistName}
                        artworkUrl={podcast.artworkUrl600 || podcast.artworkUrl100 || ''}
                        onClick={() =>
                          navigate({
                            to: '/podcast/$id',
                            params: { id: String(podcast.collectionId) },
                          })
                        }
                        menuItems={[
                          {
                            label: subscribed ? t('unsubscribe') : t('subscribe'),
                            icon: subscribed ? <CircleMinus size={14} /> : <CirclePlus size={14} />,
                            onClick: () => {
                              if (subscribed) {
                                if (podcast.feedUrl) unsubscribe(podcast.feedUrl)
                              } else {
                                subscribe(podcast)
                              }
                            },
                            variant: subscribed ? 'destructive' : 'default',
                          },
                        ]}
                      />
                    )
                  })}
                </div>
              </section>
            )}

            {/* Episodes Section */}
            {episodes.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Mic2 className="w-5 h-5" />
                  {t('searchEpisodes')}
                </h2>
                <div className="space-y-0">
                  {episodes.map((episode) => (
                    <SearchEpisodeItem
                      key={episode.trackId}
                      episode={episode}
                      onPlay={() => handlePlaySearchEpisode(episode)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

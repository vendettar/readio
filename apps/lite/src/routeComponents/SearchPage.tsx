import { useNavigate, useSearch } from '@tanstack/react-router'
import { CircleMinus, CirclePlus, Library, Mic2, Podcast, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SearchEpisodeItem } from '../components/GlobalSearch/SearchEpisodeItem'
import { SearchResultItem } from '../components/GlobalSearch/SearchResultItem'
import { PodcastCard } from '../components/PodcastCard/PodcastCard'
import { PodcastGrid } from '../components/PodcastGrid'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { LoadingPage } from '../components/ui/loading-spinner'
import { useEpisodePlayback } from '../hooks/useEpisodePlayback'
import { type LocalSearchResult, useGlobalSearch } from '../hooks/useGlobalSearch'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import discovery, { type SearchEpisode } from '../lib/discovery'
import { executeLocalSearchAction } from '../lib/localSearchActions'
import { toast } from '../lib/toast'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'

export default function SearchPage() {
  const { t } = useTranslation()
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
    // Optimization: Feed URL is now available in SearchEpisode (entity=podcastEpisode)!
    // Only lookup if it's missing (e.g. from a hypothetical source that lacks it)
    let podcastFeedUrl = episode.feedUrl
    if (!podcastFeedUrl) {
      const fullPodcast = await discovery.getPodcast(episode.providerPodcastId.toString())
      podcastFeedUrl = fullPodcast?.feedUrl
    }

    if (!podcastFeedUrl) {
      toast.error(t('errorPodcastFeedNotFound'))
      navigate({ to: '/podcast/$id', params: { id: episode.providerPodcastId.toString() } })
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
      <div className="w-full max-w-content mx-auto px-page pt-page pb-8">
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
        {isLoading && <LoadingPage />}

        {/* Empty state */}
        {isEmpty && !isLoading && query && (
          <EmptyState
            icon={Search}
            title={t('searchNoResults')}
            description={t('searchEmptyHint')}
            action={<Button onClick={() => navigate({ to: '/explore' })}>{t('navExplore')}</Button>}
          />
        )}

        {/* No query state */}
        {!query && (
          <EmptyState
            icon={Search}
            title={t('searchEmptyTitle')}
            description={t('searchEmptyBody')}
            action={<Button onClick={() => navigate({ to: '/explore' })}>{t('navExplore')}</Button>}
          />
        )}

        {/* Results */}
        {!isLoading && query && (
          <div className="space-y-12">
            {/* Local Library Results */}
            {local.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Library className="w-5 h-5" />
                  {t('searchYourLibrary')}
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
                <PodcastGrid>
                  {podcasts.map((podcast) => {
                    const subscribed = podcast.feedUrl ? isSubscribed(podcast.feedUrl) : false
                    return (
                      <PodcastCard
                        key={podcast.providerPodcastId}
                        id={String(podcast.providerPodcastId)}
                        title={podcast.collectionName}
                        subtitle={podcast.artistName}
                        artworkUrl={podcast.artworkUrl600 || podcast.artworkUrl100 || ''}
                        onClick={() =>
                          navigate({
                            to: '/podcast/$id',
                            params: { id: String(podcast.providerPodcastId) },
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
                </PodcastGrid>
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
                      key={episode.providerEpisodeId}
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

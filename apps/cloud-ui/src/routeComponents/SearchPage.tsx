import { useNavigate, useSearch } from '@tanstack/react-router'
import { Library, Mic2, Podcast, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { EpisodeListSkeleton } from '../components/EpisodeRow'
import { SearchEpisodeItem } from '../components/GlobalSearch/SearchEpisodeItem'
import { SearchResultItem } from '../components/GlobalSearch/SearchResultItem'
import { PageHeader, PageShell } from '../components/layout'
import { PodcastCard } from '../components/PodcastCard/PodcastCard'
import { PodcastGrid } from '../components/PodcastGrid'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { LoadingSpinner } from '../components/ui/loading-spinner'
import { Skeleton } from '../components/ui/skeleton'
import { useEpisodePlayback } from '../hooks/useEpisodePlayback'
import { type LocalSearchResult, useGlobalSearch } from '../hooks/useGlobalSearch'
import { executeLocalSearchAction } from '../lib/localSearchActions'
import { PLAYBACK_REQUEST_MODE } from '../lib/player/playbackMode'
import { buildPodcastShowRoute, normalizeCountryParam } from '../lib/routes/podcastRoutes'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'
import { useTranscriptStore } from '../store/transcriptStore'

export default function SearchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { q: query = '' } = useSearch({ from: '/search' })
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const loadAudioBlob = usePlayerStore((s) => s.loadAudioBlob)
  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const setSubtitles = useTranscriptStore((s) => s.setSubtitles)
  const setSessionId = usePlayerStore((s) => s.setSessionId)
  const setPlaybackTrackId = usePlayerStore((s) => s.setPlaybackTrackId)
  const globalCountry = normalizeCountryParam(useExploreStore((s) => s.country))
  const { playSearchEpisode } = useEpisodePlayback()

  const { podcasts, episodes, local, isLoading } = useGlobalSearch(query, true, {
    subscriptionLimit: Infinity,
    favoriteLimit: Infinity,
    historyLimit: Infinity,
    fileLimit: Infinity,
  })

  const handleSelectLocalResult = (result: LocalSearchResult) => {
    void executeLocalSearchAction(result, {
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

  return (
    <PageShell contentClassName="pb-8">
      <PageHeader
        title={query ? `"${query}"` : t('searchPlaceholderGlobal')}
        meta={
          query ? (
            <p className="text-xl text-muted-foreground font-medium">
              {t('searchResultsCount', { count: podcasts.length + episodes.length + local.length })}
            </p>
          ) : undefined
        }
      />

      {/* Idle Prompt state */}
      {!query && (
        <EmptyState
          icon={Search}
          title={t('searchEmptyTitle')}
          description={t('searchEmptyBody')}
          action={
            <Button onClick={() => void navigate({ to: '/explore' })}>{t('navExplore')}</Button>
          }
        />
      )}

      {/* Loading state - Preserves shell & header */}
      {isLoading && !podcasts.length && !episodes.length && !local.length && (
        <output
          data-testid="initial-loading"
          aria-busy="true"
          aria-live="polite"
          aria-label={t('loadingSearchResults')}
          className="space-y-12 animate-in fade-in duration-500"
        >
          <section>
            <Skeleton className="h-6 w-48 mb-6 rounded-md" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="aspect-square rounded-2xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          </section>
          <section>
            <Skeleton className="h-6 w-48 mb-6 rounded-md" />
            <EpisodeListSkeleton count={4} label={t('loadingEpisodes')} announce={false} />
          </section>
        </output>
      )}

      {/* Empty state (No results for query) */}
      {query && !isLoading && !podcasts.length && !episodes.length && !local.length && (
        <EmptyState
          icon={Search}
          title={t('searchNoResults')}
          description={t('searchEmptyHint')}
          action={
            <Button onClick={() => void navigate({ to: '/explore' })}>{t('navExplore')}</Button>
          }
        />
      )}

      {/* Results - Keep visible even during revalidation (isLoading) */}
      {query && (podcasts.length > 0 || episodes.length > 0 || local.length > 0) && (
        <div
          className={cn('space-y-12 transition-opacity duration-300', isLoading && 'opacity-60')}
        >
          {/* Revalidation Indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse mb-6">
              <LoadingSpinner size="sm" />
              <span>{t('loading')}</span>
            </div>
          )}

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
                    artworkBlob={result.artworkBlob}
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
                  const showRoute = buildPodcastShowRoute({
                    country: globalCountry,
                    podcastId: String(podcast.podcastItunesId),
                  })
                  return (
                    <PodcastCard
                      key={podcast.podcastItunesId}
                      id={String(podcast.podcastItunesId)}
                      title={podcast.title || ''}
                      subtitle={podcast.author || ''}
                      artworkUrl={podcast.artwork || ''}
                      onClick={() => {
                        if (showRoute) {
                          void navigate(showRoute)
                        }
                      }}
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
                    key={episode.episodeUrl}
                    episode={episode}
                    onPlay={() => playSearchEpisode(episode, globalCountry ?? undefined)}
                    onPlayWithoutTranscript={() =>
                      playSearchEpisode(episode, globalCountry ?? undefined, {
                        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
                      })
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  )
}

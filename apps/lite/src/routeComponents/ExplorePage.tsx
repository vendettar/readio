import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PodcastEpisodesGrid } from '../components/Explore/PodcastEpisodesGrid'
import { PodcastShowsCarousel } from '../components/Explore/PodcastShowsCarousel'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { LoadingPage } from '../components/ui/loading-spinner'
import {
  type DiscoveryPodcast,
  useEditorPicks,
  useTopEpisodes,
  useTopPodcasts,
} from '../hooks/useDiscoveryPodcasts'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import type { Subscription } from '../lib/dexieDb'
import discovery, { type Episode, type Podcast } from '../lib/discovery'
import { getDiscoveryArtworkUrl } from '../lib/imageUtils'
import { logError, warn as logWarn } from '../lib/logger'
import { openExternal } from '../lib/openExternal'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'

/**
 * Extract podcast ID from provider URL
 * Pattern: /podcast/.../id{ID} or /id{ID}
 */
function extractPodcastIdFromUrl(url: string): string | null {
  const match = url.match(/\/id(\d+)/)
  return match ? match[1] : null
}

export default function ExplorePage() {
  const { t } = useTranslation()

  // Player actions
  const setAudioUrl = usePlayerStore((state) => state.setAudioUrl)
  const play = usePlayerStore((state) => state.play)

  // Network status
  const { isOnline } = useNetworkStatus()

  // Data fetching
  const { data: editorPicks, isLoading: isLoadingPicks } = useEditorPicks('us')
  const { data: topShows, isLoading: isLoadingShows } = useTopPodcasts('us', 30)
  const { data: topEpisodes, isLoading: isLoadingEpisodes } = useTopEpisodes('us', 30)

  // Handler for playing episode directly (Optimized: single lookup call)
  const handlePlayEpisode = async (episode: DiscoveryPodcast) => {
    const podcastId = extractPodcastIdFromUrl(episode.url)
    if (!podcastId) {
      if (episode.url) openExternal(episode.url)
      return
    }

    try {
      // Single lookup call - feedUrl is included in response
      const matchedEpisode: Episode | null = await discovery.lookupEpisode(episode.id)

      if (matchedEpisode?.audioUrl) {
        let podcastFeedUrl = matchedEpisode.feedUrl
        if (!podcastFeedUrl) {
          const podcast = await discovery.getPodcast(podcastId, 'us')
          podcastFeedUrl = podcast?.feedUrl
        }
        if (!podcastFeedUrl) {
          logWarn('[handlePlayEpisode] Feed URL not found')
          if (episode.url) openExternal(episode.url)
          return
        }

        const coverArt = getDiscoveryArtworkUrl(
          matchedEpisode.artworkUrl || episode.artworkUrl100,
          600
        )

        setAudioUrl(matchedEpisode.audioUrl, matchedEpisode.title, coverArt, {
          description: matchedEpisode.description,
          podcastTitle: matchedEpisode.collectionName || episode.artistName,
          podcastFeedUrl,
          artworkUrl: coverArt,
          publishedAt: matchedEpisode.pubDate
            ? new Date(matchedEpisode.pubDate).getTime()
            : undefined,
          duration: matchedEpisode.duration,
        })
        play()
      } else {
        // Episode lookup failed - open in external browser
        if (episode.url) openExternal(episode.url)
      }
    } catch (error) {
      logError('[handlePlayEpisode] Lookup failed:', error)
      if (episode.url) openExternal(episode.url)
    }
  }

  // Handler for subscribing from card (Lookup needed for RSS results)
  const handleSubscribePodcast = async (podcast: DiscoveryPodcast) => {
    try {
      // Optimization: If feedUrl already exists (e.g. Editor's Picks via Lookup API),
      // construct a partial Podcast object and subscribe immediately.
      if (podcast.feedUrl) {
        const partialPodcast: Podcast = {
          providerPodcastId: Number(podcast.id),
          collectionName: podcast.name,
          artistName: podcast.artistName,
          artworkUrl100: podcast.artworkUrl100,
          artworkUrl600: podcast.artworkUrl100, // Fallback
          feedUrl: podcast.feedUrl,
          collectionViewUrl: '', // Dummy
          genres: [], // Dummy
        }

        const subscriptions = useExploreStore.getState().subscriptions
        const isSubscribed = subscriptions.some((s: Subscription) => s.feedUrl === podcast.feedUrl)

        if (isSubscribed) {
          await useExploreStore.getState().unsubscribe(podcast.feedUrl)
        } else {
          await useExploreStore.getState().subscribe(partialPodcast)
        }
        return
      }

      // Fallback for RSS Chart podcasts (no feedUrl in initial response)
      const fullPodcast = await discovery.getPodcast(podcast.id, 'us')
      if (fullPodcast) {
        const subscriptions = useExploreStore.getState().subscriptions
        const isSubscribed = subscriptions.some(
          (s: Subscription) => s.feedUrl === fullPodcast.feedUrl
        )

        if (isSubscribed) {
          if (fullPodcast?.feedUrl) {
            await useExploreStore.getState().unsubscribe(fullPodcast.feedUrl)
          }
        } else {
          await useExploreStore.getState().subscribe(fullPodcast)
        }
      }
    } catch (error) {
      logError('[handleSubscribePodcast] Failed:', error)
    }
  }

  // Handler for playing latest episode from podcast card
  const handlePlayLatestEpisode = async (podcast: DiscoveryPodcast) => {
    try {
      // Optimization: Use pre-existing feedUrl if available (Editor's Picks)
      const feedUrl = podcast.feedUrl || (await discovery.getPodcast(podcast.id, 'us'))?.feedUrl

      if (feedUrl) {
        const feed = await discovery.fetchPodcastFeed(feedUrl)
        if (feed.episodes?.[0]) {
          const latest = feed.episodes[0]
          const podcastTitle = podcast.name || feed.title
          const coverArt = getDiscoveryArtworkUrl(latest.artworkUrl || podcast.artworkUrl100, 600)

          setAudioUrl(latest.audioUrl, latest.title, coverArt, {
            description: latest.description,
            podcastTitle: podcastTitle,
            podcastFeedUrl: feedUrl,
            artworkUrl: coverArt,
            publishedAt: latest.pubDate ? new Date(latest.pubDate).getTime() : undefined,
            duration: latest.duration,
          })
          play()
        }
      }
    } catch (error) {
      logError('[handlePlayLatestEpisode] Failed:', error)
    }
  }

  // Handler for favoriting episode from charts (Lookup needed for RSS results)
  const handleToggleFavoriteEpisode = async (episode: DiscoveryPodcast) => {
    const podcastId = extractPodcastIdFromUrl(episode.url)
    if (!podcastId) return

    try {
      const store = useExploreStore.getState()
      const favorites = store.favorites

      // Check if already favorited.
      // RSS episodes don't have audioUrl yet, so we match by episodeId (trackId)
      const favorited = favorites.find(
        (f) => f.episodeId === episode.id || f.audioUrl === episode.url
      )

      if (favorited) {
        await store.removeFavorite(favorited.key)
        return
      }

      // STEP 1: Try Precision Lookup by trackId (fastest)
      let fullEpisode: Episode | null = await discovery.lookupEpisode(episode.id)

      // STEP 2: Try iTunes Podcast Lookup if track-level fails
      if (!fullEpisode) {
        const providerEpisodes = await discovery.getPodcastEpisodes(podcastId, 'us', 50)
        fullEpisode =
          providerEpisodes.find(
            (ep) =>
              ep.id === episode.id || ep.title.toLowerCase().includes(episode.name.toLowerCase())
          ) || null
      }

      // Optimization: feedUrl is available directly in the Episode result!
      let podcastFeedUrl = fullEpisode?.feedUrl
      let podcastTitle = fullEpisode?.collectionName
      let fullPodcast: Podcast | null = null

      if (!podcastFeedUrl) {
        fullPodcast = await discovery.getPodcast(podcastId, 'us')
        podcastFeedUrl = fullPodcast?.feedUrl
        podcastTitle = fullPodcast?.collectionName || podcastTitle
      }

      if (!podcastFeedUrl) {
        // Last ditch effort: Fallback to RSS Feed matching if not found in iTunes results
        // Use cached fullPodcast if available, otherwise (rare case) try lookup but we probably already did
        const podcastToUse = fullPodcast || (await discovery.getPodcast(podcastId, 'us'))

        if (podcastToUse?.feedUrl) {
          try {
            const feed = await discovery.fetchPodcastFeed(podcastToUse.feedUrl)
            const rssEpisode = feed.episodes.find((ep) => {
              const epTitle = ep.title.trim().toLowerCase()
              const apiTitle = episode.name.trim().toLowerCase()
              return (
                epTitle === apiTitle || epTitle.includes(apiTitle) || apiTitle.includes(epTitle)
              )
            })

            if (rssEpisode) {
              const epObj: Episode = {
                id: rssEpisode.id,
                title: rssEpisode.title,
                description: rssEpisode.description || '',
                audioUrl: rssEpisode.audioUrl,
                pubDate: rssEpisode.pubDate || '',
                artworkUrl: rssEpisode.artworkUrl,
                duration: rssEpisode.duration,
              }
              await store.addFavorite(podcastToUse, epObj)
              return
            }
          } catch (feedError) {
            logWarn('[handleToggleFavoriteEpisode] RSS fallback failed:', feedError)
          }
        }
      }

      if (!fullEpisode || !podcastFeedUrl) {
        logError('[handleToggleFavoriteEpisode] Episode or podcast feed not found')
        return
      }

      // Construct full podcast object for potential store subscription requirements
      const podcastObj: Podcast = {
        providerPodcastId: Number(podcastId),
        collectionName: fullEpisode.collectionName || podcastTitle || '',
        artistName: fullEpisode.artistName || episode.artistName,
        feedUrl: podcastFeedUrl,
        artworkUrl600: fullEpisode.artworkUrl || '',
        artworkUrl100: fullEpisode.artworkUrl || '',
        collectionViewUrl: '', // Dummy for required field
        genres: [], // Dummy for required field
      }

      const epObj: Episode = {
        id: fullEpisode.id,
        title: fullEpisode.title,
        description: fullEpisode.description || '',
        audioUrl: fullEpisode.audioUrl,
        pubDate: fullEpisode.pubDate || '',
        artworkUrl: fullEpisode.artworkUrl,
        duration: fullEpisode.duration,
      }
      await store.addFavorite(podcastObj, epObj)
    } catch (error) {
      logError('[handleToggleFavoriteEpisode] Failed:', error)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="w-full max-w-content mx-auto px-page pt-page pb-14 min-h-full">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            {t('exploreTitle')}
          </h1>
          <p className="text-lg text-muted-foreground">{t('exploreSubtitle')}</p>
        </header>

        {!isOnline && (
          <div className="py-10">
            <p className="text-muted-foreground mb-4">{t('offline.badge')}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link to="/subscriptions" className="font-medium text-primary hover:underline">
                {t('sidebarSubscriptions')}
              </Link>
              <Link to="/favorites" className="font-medium text-primary hover:underline">
                {t('sidebarFavorites')}
              </Link>
              <Link to="/history" className="font-medium text-primary hover:underline">
                {t('sidebarHistory')}
              </Link>
              <Link to="/files" className="font-medium text-primary hover:underline">
                {t('navFiles')}
              </Link>
            </div>
          </div>
        )}

        {isOnline && (
          <>
            {/* Global Loading State - fulfill instruction 012 requirement */}
            {isLoadingPicks && isLoadingShows && isLoadingEpisodes ? (
              <LoadingPage />
            ) : !editorPicks?.length &&
              !topShows?.length &&
              !topEpisodes?.length &&
              !isLoadingPicks &&
              !isLoadingShows &&
              !isLoadingEpisodes ? (
              <EmptyState
                icon={Compass}
                title={t('noResults')}
                description={t('errorNetwork')}
                action={
                  <Button onClick={() => window.location.reload()}>{t('modalCrashedRetry')}</Button>
                }
              />
            ) : (
              /* Content Sections */
              <div className="space-y-12">
                {/* Module D: Editor's Picks - Only show if region has configured picks */}
                {editorPicks && editorPicks.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold mb-4">{t('editorPicksTitle')}</h2>
                    <PodcastShowsCarousel
                      podcasts={editorPicks}
                      isLoading={isLoadingPicks}
                      onPlayLatest={handlePlayLatestEpisode}
                      onSubscribe={handleSubscribePodcast}
                    />
                  </section>
                )}

                {/* Top Shows */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">{t('topShowsTitle')}</h2>
                  </div>
                  <PodcastShowsCarousel
                    podcasts={topShows || []}
                    isLoading={isLoadingShows}
                    onPlayLatest={handlePlayLatestEpisode}
                    onSubscribe={handleSubscribePodcast}
                  />
                </section>

                {/* Top Episodes */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">{t('topEpisodesTitle')}</h2>
                  </div>
                  <PodcastEpisodesGrid
                    episodes={topEpisodes || []}
                    onPlay={handlePlayEpisode}
                    onFavorite={handleToggleFavoriteEpisode}
                    isLoading={isLoadingEpisodes}
                  />
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

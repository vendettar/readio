import React from 'react'
import { PodcastEpisodesGrid } from '../components/Explore/PodcastEpisodesGrid'
import { PodcastShowsCarousel } from '../components/Explore/PodcastShowsCarousel'
import {
  type DiscoveryPodcast,
  useEditorPicks,
  useTopEpisodes,
  useTopPodcasts,
  useTopSubscriberPodcasts,
} from '../hooks/useDiscoveryPodcasts'
import { useI18n } from '../hooks/useI18n'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import type { Subscription } from '../libs/dexieDb'
import {
  type Episode,
  fetchPodcastFeed,
  lookupEpisode,
  lookupPodcastEpisodes,
  lookupPodcastFull,
  type Podcast,
  type SearchEpisode,
} from '../libs/discoveryProvider'
import { getDiscoveryArtworkUrl } from '../libs/imageUtils'
import { openExternal } from '../libs/openExternal'
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
  const { t } = useI18n()

  // Player actions
  const setAudioUrl = usePlayerStore((state) => state.setAudioUrl)
  const play = usePlayerStore((state) => state.play)

  // Data fetching
  const { data: editorPicks, isLoading: isLoadingPicks } = useEditorPicks('us')
  const { data: topShows, isLoading: isLoadingShows } = useTopPodcasts('us', 30)
  const { data: topSubscriberShows, isLoading: isLoadingSubscribers } = useTopSubscriberPodcasts(
    'us',
    30
  )
  const { data: topEpisodes, isLoading: isLoadingEpisodes } = useTopEpisodes('us', 30)

  // Keyboard shortcuts (no modal open now)
  useKeyboardShortcuts({ isModalOpen: false })

  // Load subscriptions/favorites on mount
  const loadSubscriptions = useExploreStore((s) => s.loadSubscriptions)
  const loadFavorites = useExploreStore((s) => s.loadFavorites)
  const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded)
  const favoritesLoaded = useExploreStore((s) => s.favoritesLoaded)

  React.useEffect(() => {
    if (!subscriptionsLoaded) loadSubscriptions()
  }, [subscriptionsLoaded, loadSubscriptions])

  React.useEffect(() => {
    if (!favoritesLoaded) loadFavorites()
  }, [favoritesLoaded, loadFavorites])

  // Handler for playing episode directly (Rapid & Accurate: iTunes API)
  const handlePlayEpisode = async (episode: DiscoveryPodcast) => {
    const podcastId = extractPodcastIdFromUrl(episode.url)
    if (!podcastId) {
      if (episode.url) openExternal(episode.url)
      return
    }

    try {
      // STEP 1: Precision Lookup by trackId (Highest Efficiency)
      let matchedEpisode: SearchEpisode | null = await lookupEpisode(episode.id)

      // STEP 2: Fallback to Podcast-level lookup if track-level fails or lacks URL
      if (!matchedEpisode?.episodeUrl) {
        const results = await lookupPodcastEpisodes(podcastId, 'us', 20)
        matchedEpisode =
          results.find(
            (ep) =>
              String(ep.trackId) === episode.id ||
              ep.trackName.toLowerCase().includes(episode.name.toLowerCase())
          ) || null
      }

      if (matchedEpisode?.episodeUrl) {
        // Optimization: feedUrl is available directly in the Precision Episode result!
        let podcastFeedUrl = matchedEpisode.feedUrl

        if (!podcastFeedUrl) {
          // Safety Fallback (should be rare)
          const fullPodcast = await lookupPodcastFull(podcastId)
          podcastFeedUrl = fullPodcast?.feedUrl
        }

        if (!podcastFeedUrl) {
          console.warn('[handlePlayEpisode] Feed URL not found')
          if (episode.url) openExternal(episode.url)
          return
        }

        const coverArt = getDiscoveryArtworkUrl(
          matchedEpisode.artworkUrl600 || matchedEpisode.artworkUrl100,
          600
        )

        setAudioUrl(matchedEpisode.episodeUrl, matchedEpisode.trackName, coverArt, {
          description: matchedEpisode.description,
          podcastTitle: matchedEpisode.collectionName,
          podcastFeedUrl,
          artworkUrl: coverArt,
          publishedAt: matchedEpisode.releaseDate
            ? new Date(matchedEpisode.releaseDate).getTime()
            : undefined,
          duration: matchedEpisode.trackTimeMillis
            ? Math.round(matchedEpisode.trackTimeMillis / 1000)
            : undefined,
        })
        play()
        if (episode.url) openExternal(episode.url)
      }
    } catch (error) {
      console.error('[handlePlayEpisode] Precision lookup failed, falling back:', error)
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
          collectionId: Number(podcast.id),
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
      const fullPodcast = await lookupPodcastFull(podcast.id)
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
      console.error('[handleSubscribePodcast] Failed:', error)
    }
  }

  // Handler for playing latest episode from podcast card
  const handlePlayLatestEpisode = async (podcast: DiscoveryPodcast) => {
    try {
      // Optimization: Use pre-existing feedUrl if available (Editor's Picks)
      const feedUrl = podcast.feedUrl || (await lookupPodcastFull(podcast.id))?.feedUrl

      if (feedUrl) {
        const feed = await fetchPodcastFeed(feedUrl)
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
      console.error('[handlePlayLatestEpisode] Failed:', error)
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
      let fullEpisode: SearchEpisode | null = await lookupEpisode(episode.id)

      // STEP 2: Try iTunes Podcast Lookup if track-level fails
      if (!fullEpisode) {
        const itunesEpisodes = await lookupPodcastEpisodes(podcastId, 'us', 50)
        fullEpisode =
          itunesEpisodes.find(
            (ep) =>
              String(ep.trackId) === episode.id ||
              ep.trackName.toLowerCase().includes(episode.name.toLowerCase())
          ) || null
      }

      // Optimization: feedUrl is available directly in the Precision Episode result!
      let podcastFeedUrl = fullEpisode?.feedUrl
      let podcastTitle = fullEpisode?.collectionName
      let fullPodcast: Podcast | null = null

      if (!podcastFeedUrl) {
        fullPodcast = await lookupPodcastFull(podcastId)
        podcastFeedUrl = fullPodcast?.feedUrl
        podcastTitle = fullPodcast?.collectionName || podcastTitle
      }

      if (!podcastFeedUrl) {
        // Last ditch effort: Fallback to RSS Feed matching if not found in iTunes results
        // Use cached fullPodcast if available, otherwise (rare case) try lookup but we probably already did
        const podcastToUse = fullPodcast || (await lookupPodcastFull(podcastId))

        if (podcastToUse?.feedUrl) {
          try {
            const feed = await fetchPodcastFeed(podcastToUse.feedUrl)
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
            console.warn('[handleToggleFavoriteEpisode] RSS fallback failed:', feedError)
          }
        }
      }

      if (!fullEpisode || !podcastFeedUrl) {
        console.error('[handleToggleFavoriteEpisode] Episode or podcast feed not found')
        return
      }

      // Construct full podcast object for potential store subscription requirements
      const podcastObj: Podcast = {
        collectionId: Number(podcastId),
        collectionName: podcastTitle || '',
        artistName: fullEpisode.artistName,
        feedUrl: podcastFeedUrl,
        artworkUrl600: fullEpisode.artworkUrl600,
        artworkUrl100: fullEpisode.artworkUrl100,
        collectionViewUrl: '', // Dummy for required field
        genres: [], // Dummy for required field
      }

      const epObj: Episode = {
        id: String(fullEpisode.trackId),
        title: fullEpisode.trackName,
        description: fullEpisode.description || '',
        audioUrl: fullEpisode.episodeUrl,
        pubDate: fullEpisode.releaseDate || '',
        artworkUrl: fullEpisode.artworkUrl100,
        duration: (fullEpisode.trackTimeMillis || 0) / 1000,
      }
      await store.addFavorite(podcastObj, epObj)
    } catch (error) {
      console.error('[handleToggleFavoriteEpisode] Failed:', error)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="w-full max-w-5xl mx-auto px-[var(--page-gutter-x)] pt-10 sm:pt-14 pb-14 min-h-full">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            {t('exploreTitle')}
          </h1>
          <p className="text-lg text-muted-foreground">{t('exploreSubtitle')}</p>
        </header>

        {/* Content Sections */}
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

          {/* Top Subscriber Shows */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t('topSubscriberShowsTitle')}</h2>
            </div>
            <PodcastShowsCarousel
              podcasts={topSubscriberShows || []}
              isLoading={isLoadingSubscribers}
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
      </div>
    </div>
  )
}

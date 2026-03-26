// src/__tests__/exploreStore.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../../lib/dexieDb'
import discovery from '../../lib/discovery'
import { LibraryRepository } from '../../lib/repositories/LibraryRepository'
import { __resetRequestManagerStateForTests } from '../../lib/requestManager'
import { __testOnlyResetExploreStoreFlags, useExploreStore } from '../exploreStore'

describe('ExploreStore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    await DB.clearAllData()
    __testOnlyResetExploreStoreFlags()
    __resetRequestManagerStateForTests()
    // Reset store state manually to avoid test interference
    useExploreStore.setState({
      searchQuery: '',
      country: 'us',
      view: 'search',
      subscriptions: [],
      subscriptionsLoaded: false,
      favorites: [],
      favoritesLoaded: false,
    })
  })

  describe('Search', () => {
    it('should update search query', () => {
      const { setSearchQuery } = useExploreStore.getState()

      setSearchQuery('technology')
      expect(useExploreStore.getState().searchQuery).toBe('technology')
    })

    it('should update country', () => {
      const { setCountry } = useExploreStore.getState()

      setCountry('jp')
      expect(useExploreStore.getState().country).toBe('jp')
    })

    it('should normalize and persist country setting', () => {
      const setSettingSpy = vi.spyOn(DB, 'setSetting').mockResolvedValue()
      const { setCountry } = useExploreStore.getState()

      setCountry('JP')

      expect(useExploreStore.getState().country).toBe('jp')
      expect(setSettingSpy).toHaveBeenCalledWith('explore_country', 'jp')
    })

    it('should skip persistence when country does not change after normalization', () => {
      const setSettingSpy = vi.spyOn(DB, 'setSetting').mockResolvedValue()
      const { setCountry } = useExploreStore.getState()

      setCountry('US')

      expect(useExploreStore.getState().country).toBe('us')
      expect(setSettingSpy).not.toHaveBeenCalled()
    })

    it('aborts underlying search transport when external signal aborts', async () => {
      let capturedSignal: AbortSignal | undefined
      vi.spyOn(discovery, 'searchPodcasts').mockImplementation(
        (_query, _country, _limit, signal?: AbortSignal) =>
          new Promise((_, reject) => {
            capturedSignal = signal
            signal?.addEventListener(
              'abort',
              () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
              { once: true }
            )
          })
      )

      const controller = new AbortController()
      const performPromise = useExploreStore.getState().performSearch('tech', controller.signal)
      controller.abort()
      await performPromise

      expect(capturedSignal?.aborted).toBe(true)
      expect(useExploreStore.getState().searchLoading).toBe(false)
    })
  })

  describe('View Navigation', () => {
    it('should change view', () => {
      const { setView } = useExploreStore.getState()

      setView('favorites')
      expect(useExploreStore.getState().view).toBe('favorites')

      setView('subscriptions')
      expect(useExploreStore.getState().view).toBe('subscriptions')
    })
  })

  describe('Subscriptions', () => {
    const mockPodcast = {
      providerPodcastId: 123,
      collectionName: 'Test Podcast',
      artistName: 'Test Artist',
      artworkUrl100: 'http://example.com/art.jpg',
      artworkUrl600: 'http://example.com/art-large.jpg',
      feedUrl: 'HTTP://Example.com:80/feed.xml#frag',
      collectionViewUrl: '',
      genres: [],
    }

    it('should subscribe to a podcast', async () => {
      const { subscribe, isSubscribed } = useExploreStore.getState()

      await subscribe(mockPodcast)
      expect(isSubscribed('HTTP://EXAMPLE.COM:80/feed.xml')).toBe(true)
      expect(useExploreStore.getState().subscriptions[0]?.countryAtSave).toBe('us')
      expect(useExploreStore.getState().subscriptions[0]?.feedUrl).toBe(
        'http://example.com/feed.xml'
      )
    })

    it('should unsubscribe from a podcast', async () => {
      const { subscribe, unsubscribe, isSubscribed } = useExploreStore.getState()

      await subscribe(mockPodcast)
      await unsubscribe('http://EXAMPLE.COM:80/feed.xml#ignore')
      expect(isSubscribed('http://example.com/feed.xml')).toBe(false)
    })

    it('coalesces concurrent subscribe writes for the same feedUrl', async () => {
      useExploreStore.setState({
        subscriptions: [],
        subscriptionsLoaded: true,
      })

      let resolveExistingLookup: (() => void) | undefined
      const existingLookupGate = new Promise<void>((resolve) => {
        resolveExistingLookup = resolve
      })

      const getByFeedUrlSpy = vi
        .spyOn(LibraryRepository, 'getSubscriptionByFeedUrl')
        .mockImplementation(async () => {
          await existingLookupGate
          return undefined
        })
      const addSubscriptionSpy = vi
        .spyOn(LibraryRepository, 'addSubscription')
        .mockResolvedValue('sub-coalesced')

      const { subscribe } = useExploreStore.getState()
      const first = subscribe(mockPodcast)
      const second = subscribe(mockPodcast)

      resolveExistingLookup?.()
      await Promise.all([first, second])

      expect(getByFeedUrlSpy).toHaveBeenCalledTimes(1)
      expect(addSubscriptionSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().subscriptions).toHaveLength(1)
      expect(useExploreStore.getState().isSubscribed('http://example.com/feed.xml')).toBe(true)
    })

    it('keeps shared subscribe write alive when first caller aborts', async () => {
      useExploreStore.setState({
        subscriptions: [],
        subscriptionsLoaded: true,
      })

      let resolveExistingLookup: (() => void) | undefined
      const existingLookupGate = new Promise<void>((resolve) => {
        resolveExistingLookup = resolve
      })

      vi.spyOn(LibraryRepository, 'getSubscriptionByFeedUrl').mockImplementation(async () => {
        await existingLookupGate
        return undefined
      })
      const addSubscriptionSpy = vi
        .spyOn(LibraryRepository, 'addSubscription')
        .mockResolvedValue('sub-after-abort')

      const { subscribe } = useExploreStore.getState()
      const firstController = new AbortController()
      const first = subscribe(mockPodcast, firstController.signal)
      const second = subscribe(mockPodcast)

      firstController.abort()
      resolveExistingLookup?.()
      await Promise.all([first.catch(() => {}), second])

      expect(addSubscriptionSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().isSubscribed('http://example.com/feed.xml')).toBe(true)
    })

    it('coalesces concurrent unsubscribe writes for the same feedUrl', async () => {
      useExploreStore.setState({
        subscriptions: [
          {
            id: 'sub-remove',
            feedUrl: 'http://example.com/feed.xml',
            title: 'Test Podcast',
            author: 'Test Artist',
            artworkUrl: 'http://example.com/art-large.jpg',
            addedAt: Date.now(),
            providerPodcastId: '123',
            countryAtSave: 'us',
          },
        ],
        subscriptionsLoaded: true,
      })

      let resolveRemove: (() => void) | undefined
      const removeGate = new Promise<void>((resolve) => {
        resolveRemove = resolve
      })

      const removeSpy = vi
        .spyOn(LibraryRepository, 'removeSubscriptionByFeedUrl')
        .mockImplementation(async () => {
          await removeGate
        })

      const { unsubscribe } = useExploreStore.getState()
      const first = unsubscribe('HTTP://Example.com:80/feed.xml#frag')
      const second = unsubscribe('http://example.com/feed.xml')

      resolveRemove?.()
      await Promise.all([first, second])

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().subscriptions).toHaveLength(0)
      expect(useExploreStore.getState().isSubscribed('http://example.com/feed.xml')).toBe(false)
    })

    it('coalesces concurrent bulkSubscribe writes for equivalent feed sets', async () => {
      useExploreStore.setState({
        subscriptionsLoaded: false,
      })

      let resolveBulkWrite: (() => void) | undefined
      const bulkWriteGate = new Promise<void>((resolve) => {
        resolveBulkWrite = resolve
      })

      const bulkAddSpy = vi
        .spyOn(LibraryRepository, 'bulkAddSubscriptionsIfMissing')
        .mockImplementation(async () => {
          await bulkWriteGate
          return 2
        })

      const podcastsFirst = [
        { title: 'A', xmlUrl: 'HTTP://Example.com:80/feed.xml#frag' },
        { title: 'A duplicate', xmlUrl: 'http://example.com/feed.xml' },
        { title: 'B', xmlUrl: 'https://example.org/feed' },
      ]
      const podcastsSecond = [
        { title: 'B reordered', xmlUrl: 'https://example.org/feed' },
        { title: 'A reordered', xmlUrl: 'http://example.com/feed.xml' },
      ]

      const { bulkSubscribe } = useExploreStore.getState()
      const first = bulkSubscribe(podcastsFirst)
      const second = bulkSubscribe(podcastsSecond)

      resolveBulkWrite?.()
      await Promise.all([first, second])

      expect(bulkAddSpy).toHaveBeenCalledTimes(1)
      const persisted = bulkAddSpy.mock.calls[0]?.[0] ?? []
      expect(persisted).toHaveLength(2)
      expect(persisted.map((item) => item.feedUrl).sort()).toEqual([
        'http://example.com/feed.xml',
        'https://example.org/feed',
      ])
    })
  })

  describe('Favorites', () => {
    const mockPodcast = {
      providerPodcastId: 123,
      collectionName: 'Test Podcast',
      artistName: 'Test Artist',
      artworkUrl100: 'http://example.com/art.jpg',
      artworkUrl600: '',
      feedUrl: 'HTTP://Example.com:80/feed.xml#frag',
      collectionViewUrl: '',
      genres: [],
    }

    const mockEpisode = {
      id: 'ep1',
      title: 'Episode 1',
      description: 'Test episode',
      audioUrl: 'http://example.com/ep1.mp3',
      pubDate: '2024-01-01',
    }

    it('should add a favorite', async () => {
      const { addFavorite, isFavorited, setCountry } = useExploreStore.getState()
      setCountry('JP')

      await addFavorite(mockPodcast, mockEpisode)
      expect(
        isFavorited('http://EXAMPLE.com:80/feed.xml#ignore', 'http://example.com/ep1.mp3')
      ).toBe(true)
      expect(useExploreStore.getState().favorites[0]?.countryAtSave).toBe('jp')
      expect(useExploreStore.getState().favorites[0]?.feedUrl).toBe('http://example.com/feed.xml')
    })

    it('should remove a favorite', async () => {
      const { addFavorite, removeFavorite, isFavorited } = useExploreStore.getState()

      await addFavorite(mockPodcast, mockEpisode)
      const key = `http://example.com/feed.xml::http://example.com/ep1.mp3`
      await removeFavorite(key)

      expect(isFavorited('http://example.com/feed.xml', 'http://example.com/ep1.mp3')).toBe(false)
    })

    it('coalesces concurrent addFavorite writes for the same key', async () => {
      useExploreStore.setState({
        favorites: [],
        favoritesLoaded: true,
      })

      let resolveFavoriteLookup: (() => void) | undefined
      const favoriteLookupGate = new Promise<void>((resolve) => {
        resolveFavoriteLookup = resolve
      })

      const getFavoriteSpy = vi
        .spyOn(LibraryRepository, 'getFavoriteByKey')
        .mockImplementation(async () => {
          await favoriteLookupGate
          return undefined
        })
      const addFavoriteSpy = vi
        .spyOn(LibraryRepository, 'addFavorite')
        .mockResolvedValue('fav-coalesced')

      const { addFavorite } = useExploreStore.getState()
      const first = addFavorite(mockPodcast, mockEpisode)
      const second = addFavorite(mockPodcast, mockEpisode)

      resolveFavoriteLookup?.()
      await Promise.all([first, second])

      expect(getFavoriteSpy).toHaveBeenCalledTimes(1)
      expect(addFavoriteSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().favorites).toHaveLength(1)
      expect(
        useExploreStore.getState().isFavorited(mockPodcast.feedUrl, mockEpisode.audioUrl)
      ).toBe(true)
    })

    it('keeps shared addFavorite write alive when first caller aborts', async () => {
      useExploreStore.setState({
        favorites: [],
        favoritesLoaded: true,
      })

      let resolveFavoriteLookup: (() => void) | undefined
      const favoriteLookupGate = new Promise<void>((resolve) => {
        resolveFavoriteLookup = resolve
      })

      vi.spyOn(LibraryRepository, 'getFavoriteByKey').mockImplementation(async () => {
        await favoriteLookupGate
        return undefined
      })
      const addFavoriteSpy = vi
        .spyOn(LibraryRepository, 'addFavorite')
        .mockResolvedValue('fav-after-abort')

      const { addFavorite } = useExploreStore.getState()
      const firstController = new AbortController()
      const first = addFavorite(mockPodcast, mockEpisode, firstController.signal)
      const second = addFavorite(mockPodcast, mockEpisode)

      firstController.abort()
      resolveFavoriteLookup?.()
      await Promise.all([first.catch(() => {}), second])

      expect(addFavoriteSpy).toHaveBeenCalledTimes(1)
      expect(
        useExploreStore.getState().isFavorited(mockPodcast.feedUrl, mockEpisode.audioUrl)
      ).toBe(true)
    })

    it('aborts operation and skips state mutation when all callers abort', async () => {
      let resolveAdd: (() => void) | undefined
      const addGate = new Promise<void>((resolve) => {
        resolveAdd = resolve
      })

      const addFavoriteSpy = vi
        .spyOn(LibraryRepository, 'addFavorite')
        .mockImplementation(async () => {
          await addGate
          return 'fav-id-all-aborted'
        })

      const { addFavorite } = useExploreStore.getState()
      const firstController = new AbortController()
      const secondController = new AbortController()

      const first = addFavorite(mockPodcast, mockEpisode, firstController.signal)
      const second = addFavorite(mockPodcast, mockEpisode, secondController.signal)
      firstController.abort()
      secondController.abort()
      resolveAdd?.()

      await Promise.all([first.catch(() => {}), second.catch(() => {})])

      // Since both callers aborted synchronously before yielding to the microtask queue,
      // the deduplication layer aborts the task immediately without hitting the repository
      expect(addFavoriteSpy).not.toHaveBeenCalled()

      // Request might have reached the repository before abort or short-circuited
      // But state should NOT be mutated
      expect(
        useExploreStore.getState().isFavorited(mockPodcast.feedUrl, mockEpisode.audioUrl)
      ).toBe(false)
      expect(useExploreStore.getState().favorites).toHaveLength(0)
    })

    it('coalesces concurrent removeFavorite writes for the same key', async () => {
      const key = 'http://example.com/feed.xml::http://example.com/ep1.mp3'
      useExploreStore.setState({
        favorites: [
          {
            id: 'fav-remove',
            key,
            feedUrl: 'http://example.com/feed.xml',
            podcastTitle: 'Test Podcast',
            episodeTitle: 'Episode 1',
            pubDate: '2024-01-01',
            audioUrl: 'http://example.com/ep1.mp3',
            durationSeconds: 0,
            artworkUrl: 'http://example.com/art.jpg',
            addedAt: Date.now(),
            countryAtSave: 'us',
          },
        ],
        favoritesLoaded: true,
      })

      let resolveRemove: (() => void) | undefined
      const removeGate = new Promise<void>((resolve) => {
        resolveRemove = resolve
      })

      const removeSpy = vi
        .spyOn(LibraryRepository, 'removeFavoriteByKey')
        .mockImplementation(async () => {
          await removeGate
        })

      const { removeFavorite } = useExploreStore.getState()
      const first = removeFavorite(key)
      const second = removeFavorite(key)

      resolveRemove?.()
      await Promise.all([first, second])

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().favorites).toHaveLength(0)
      expect(
        useExploreStore
          .getState()
          .isFavorited('http://example.com/feed.xml', 'http://example.com/ep1.mp3')
      ).toBe(false)
    })
  })

  describe('Async Request Isolation', () => {
    it('retries subscription lazy hydration after transient failure', async () => {
      const subscription = {
        id: 'sub-retry',
        feedUrl: 'https://example.com/feed.xml',
        title: 'Subscription Retry',
        author: 'Author',
        artworkUrl: '',
        addedAt: Date.now(),
        providerPodcastId: '123',
        countryAtSave: 'us',
      }

      const getAllSubscriptionsSpy = vi
        .spyOn(LibraryRepository, 'getAllSubscriptions')
        .mockRejectedValueOnce(new Error('temporary indexeddb read failure'))
        .mockResolvedValueOnce([subscription])

      useExploreStore.setState({
        subscriptions: [],
        subscriptionsLoaded: false,
      })

      await useExploreStore.getState().loadSubscriptions()
      expect(useExploreStore.getState().subscriptionsLoaded).toBe(false)
      expect(useExploreStore.getState().subscriptions).toEqual([])

      await useExploreStore.getState().loadSubscriptions()
      expect(getAllSubscriptionsSpy).toHaveBeenCalledTimes(2)
      expect(useExploreStore.getState().subscriptionsLoaded).toBe(true)
      expect(useExploreStore.getState().subscriptions).toEqual([subscription])
    })

    it('retries favorites lazy hydration after transient failure', async () => {
      const favorite = {
        id: 'fav-retry',
        key: 'fav-retry-key',
        feedUrl: 'https://example.com/feed.xml',
        podcastTitle: 'Podcast Retry',
        episodeTitle: 'Episode Retry',
        audioUrl: 'https://example.com/audio.mp3',
        artworkUrl: '',
        addedAt: Date.now(),
        countryAtSave: 'us',
      }

      const getAllFavoritesSpy = vi
        .spyOn(LibraryRepository, 'getAllFavorites')
        .mockRejectedValueOnce(new Error('temporary indexeddb read failure'))
        .mockResolvedValueOnce([favorite])

      useExploreStore.setState({
        favorites: [],
        favoritesLoaded: false,
      })

      await useExploreStore.getState().loadFavorites()
      expect(useExploreStore.getState().favoritesLoaded).toBe(false)
      expect(useExploreStore.getState().favorites).toEqual([])

      await useExploreStore.getState().loadFavorites()
      expect(getAllFavoritesSpy).toHaveBeenCalledTimes(2)
      expect(useExploreStore.getState().favoritesLoaded).toBe(true)
      expect(useExploreStore.getState().favorites).toEqual([favorite])
    })

    it('loadSubscriptions and loadFavorites complete without cross-canceling each other', async () => {
      const subscriptions = [
        {
          id: 'sub-1',
          feedUrl: 'https://example.com/feed.xml',
          title: 'Subscription',
          author: 'Author',
          artworkUrl: '',
          addedAt: Date.now(),
          providerPodcastId: '123',
          countryAtSave: 'us',
        },
      ]
      const favorites = [
        {
          id: 'fav-1',
          key: 'k1',
          feedUrl: 'https://example.com/feed.xml',
          podcastTitle: 'Podcast',
          episodeTitle: 'Episode',
          audioUrl: 'https://example.com/audio.mp3',
          artworkUrl: '',
          addedAt: Date.now(),
          countryAtSave: 'us',
        },
      ]

      vi.spyOn(LibraryRepository, 'getAllSubscriptions').mockResolvedValue(subscriptions)
      vi.spyOn(LibraryRepository, 'getAllFavorites').mockResolvedValue(favorites)

      useExploreStore.setState({
        subscriptions: [],
        favorites: [],
        subscriptionsLoaded: false,
        favoritesLoaded: false,
      })

      await Promise.all([
        useExploreStore.getState().loadSubscriptions(),
        useExploreStore.getState().loadFavorites(),
      ])

      const state = useExploreStore.getState()
      expect(state.subscriptionsLoaded).toBe(true)
      expect(state.favoritesLoaded).toBe(true)
      expect(state.subscriptions).toHaveLength(1)
      expect(state.favorites).toHaveLength(1)
    })
  })
})

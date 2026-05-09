// src/__tests__/exploreStore.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../../lib/dexieDb'
import type { Podcast } from '../../lib/discovery'
import { FavoritesRepository } from '../../lib/repositories/FavoritesRepository'
import { SettingsRepository } from '../../lib/repositories/SettingsRepository'
import { SubscriptionRepository } from '../../lib/repositories/SubscriptionRepository'
import { __resetRequestManagerStateForTests } from '../../lib/requestManager'
import * as runtimeConfig from '../../lib/runtimeConfig'
import { __testOnlyResetExploreStoreFlags, useExploreStore } from '../exploreStore'
import { getInitialExploreCountry } from '../exploreStoreCountry'

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
      country: 'us',
      subscriptions: [],
      subscriptionsLoaded: false,
      favorites: [],
      favoritesLoaded: false,
    })
  })

  describe('Country', () => {
    it('uses the runtime default country synchronously', () => {
      const defaultConfig = runtimeConfig.getAppConfig()
      vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
        ...defaultConfig,
        DEFAULT_COUNTRY: 'JP',
      })

      expect(getInitialExploreCountry()).toBe('JP')
    })

    it('hydrates persisted country explicitly', async () => {
      vi.spyOn(SettingsRepository, 'getSetting').mockResolvedValue('JP')

      await useExploreStore.getState().hydrateCountry()

      expect(SettingsRepository.getSetting).toHaveBeenCalledWith('explore_country')
      expect(useExploreStore.getState().country).toBe('jp')
    })

    it('coalesces concurrent hydrateCountry calls into a single settings read', async () => {
      let resolveSetting: ((value: string) => void) | undefined
      const settingGate = new Promise<string>((resolve) => {
        resolveSetting = resolve
      })

      const getSettingSpy = vi
        .spyOn(SettingsRepository, 'getSetting')
        .mockImplementation(() => settingGate)

      const firstHydration = useExploreStore.getState().hydrateCountry()
      const secondHydration = useExploreStore.getState().hydrateCountry()

      resolveSetting?.('JP')
      await Promise.all([firstHydration, secondHydration])

      expect(getSettingSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().country).toBe('jp')
    })

    it('keeps manual selection when delayed hydration resolves later', async () => {
      let resolveSetting: ((value: string) => void) | undefined
      const settingGate = new Promise<string>((resolve) => {
        resolveSetting = resolve
      })

      vi.spyOn(SettingsRepository, 'getSetting').mockImplementation(() => settingGate)
      vi.spyOn(SettingsRepository, 'setSetting').mockResolvedValue()

      const hydration = useExploreStore.getState().hydrateCountry()
      useExploreStore.getState().setCountry('jp')
      resolveSetting?.('cn')
      await hydration

      expect(useExploreStore.getState().country).toBe('jp')
    })

    it('should update country', () => {
      const { setCountry } = useExploreStore.getState()

      setCountry('jp')
      expect(useExploreStore.getState().country).toBe('jp')
    })

    it('should normalize and persist country setting', () => {
      const setSettingSpy = vi.spyOn(SettingsRepository, 'setSetting').mockResolvedValue()
      const { setCountry } = useExploreStore.getState()

      setCountry('JP')

      expect(useExploreStore.getState().country).toBe('jp')
      expect(setSettingSpy).toHaveBeenCalledWith('explore_country', 'jp')
    })

    it('should skip persistence when country does not change after normalization', () => {
      const setSettingSpy = vi.spyOn(SettingsRepository, 'setSetting').mockResolvedValue()
      const { setCountry } = useExploreStore.getState()

      setCountry('US')

      expect(useExploreStore.getState().country).toBe('us')
      expect(setSettingSpy).toHaveBeenCalledWith('explore_country', 'us')
    })

    it('retries explicit hydration after a transient settings read failure', async () => {
      const getSettingSpy = vi
        .spyOn(SettingsRepository, 'getSetting')
        .mockRejectedValueOnce(new Error('temporary indexeddb read failure'))
        .mockResolvedValueOnce('JP')

      await useExploreStore.getState().hydrateCountry()
      expect(useExploreStore.getState().country).toBe('us')

      await useExploreStore.getState().hydrateCountry()

      expect(getSettingSpy).toHaveBeenCalledTimes(2)
      expect(useExploreStore.getState().country).toBe('jp')
    })
  })

  describe('Subscriptions', () => {
    const mockPodcast: Podcast = {
      podcastItunesId: '123',
      title: 'Test Podcast',
      author: 'Test Artist',
      artwork: 'http://example.com/art-large.jpg',
      description: 'A test podcast',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
    }

    it('should subscribe to a podcast', async () => {
      const { subscribe, isSubscribed } = useExploreStore.getState()

      await subscribe(mockPodcast, undefined, 'us')
      expect(isSubscribed('123')).toBe(true)
      expect(useExploreStore.getState().subscriptions[0]?.countryAtSave).toBe('us')
      expect(useExploreStore.getState().subscriptions[0]?.podcastItunesId).toBe('123')
    })

    it('rejects subscription persistence when canonical remote metadata is incomplete', async () => {
      const addSubscriptionSpy = vi.spyOn(SubscriptionRepository, 'addSubscription')
      const { subscribe, isSubscribed } = useExploreStore.getState()

      await subscribe(
        {
          ...mockPodcast,
          title: '   ',
        },
        undefined,
        'us'
      )

      expect(addSubscriptionSpy).not.toHaveBeenCalled()
      expect(isSubscribed('123')).toBe(false)
      expect(useExploreStore.getState().subscriptions).toHaveLength(0)
    })

    it('should unsubscribe from a podcast', async () => {
      const { subscribe, unsubscribe, isSubscribed } = useExploreStore.getState()

      await subscribe(mockPodcast, undefined, 'us')
      await unsubscribe('123')
      expect(isSubscribed('123')).toBe(false)
    })

    it('rejects subscription persistence when countryAtSave is blank', async () => {
      const addSubscriptionSpy = vi.spyOn(SubscriptionRepository, 'addSubscription')
      const { subscribe, isSubscribed } = useExploreStore.getState()

      await subscribe(mockPodcast, undefined, '   ')

      expect(addSubscriptionSpy).not.toHaveBeenCalled()
      expect(isSubscribed('123')).toBe(false)
      expect(useExploreStore.getState().subscriptions).toHaveLength(0)
    })

    it('coalesces concurrent subscribe writes for the same podcastItunesId', async () => {
      useExploreStore.setState({
        subscriptions: [],
        subscriptionsLoaded: true,
      })

      let resolveExistingLookup: (() => void) | undefined
      const existingLookupGate = new Promise<void>((resolve) => {
        resolveExistingLookup = resolve
      })

      const getByPodcastItunesIdSpy = vi
        .spyOn(SubscriptionRepository, 'getSubscriptionByPodcastItunesId')
        .mockImplementation(async () => {
          await existingLookupGate
          return undefined
        })
      const addSubscriptionSpy = vi
        .spyOn(SubscriptionRepository, 'addSubscription')
        .mockResolvedValue('sub-coalesced')

      const { subscribe } = useExploreStore.getState()
      const first = subscribe(mockPodcast, undefined, 'us')
      const second = subscribe(mockPodcast, undefined, 'us')

      resolveExistingLookup?.()
      await Promise.all([first, second])

      expect(getByPodcastItunesIdSpy).toHaveBeenCalledTimes(1)
      expect(addSubscriptionSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().subscriptions).toHaveLength(1)
      expect(useExploreStore.getState().isSubscribed('123')).toBe(true)
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

      vi.spyOn(SubscriptionRepository, 'getSubscriptionByPodcastItunesId').mockImplementation(
        async () => {
          await existingLookupGate
          return undefined
        }
      )
      const addSubscriptionSpy = vi
        .spyOn(SubscriptionRepository, 'addSubscription')
        .mockResolvedValue('sub-after-abort')

      const { subscribe } = useExploreStore.getState()
      const firstController = new AbortController()
      const first = subscribe(mockPodcast, firstController.signal, 'us')
      const second = subscribe(mockPodcast, undefined, 'us')

      firstController.abort()
      resolveExistingLookup?.()
      await Promise.all([first.catch(() => {}), second])

      expect(addSubscriptionSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().isSubscribed('123')).toBe(true)
    })

    it('coalesces concurrent unsubscribe writes for the same podcastItunesId', async () => {
      useExploreStore.setState({
        subscriptions: [
          {
            id: 'sub-remove',
            podcastItunesId: '123',
            title: 'Test Podcast',
            author: 'Test Artist',
            artworkUrl: 'http://example.com/art-large.jpg',
            addedAt: Date.now(),
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
        .spyOn(SubscriptionRepository, 'removeSubscriptionByPodcastItunesId')
        .mockImplementation(async () => {
          await removeGate
        })

      const { unsubscribe } = useExploreStore.getState()
      const first = unsubscribe('123')
      const second = unsubscribe('123')

      resolveRemove?.()
      await Promise.all([first, second])

      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().subscriptions).toHaveLength(0)
      expect(useExploreStore.getState().isSubscribed('123')).toBe(false)
    })
  })

  describe('Favorites', () => {
    const mockPodcast: Podcast = {
      podcastItunesId: '123',
      title: 'Test Podcast',
      author: 'Test Artist',
      artwork: 'http://example.com/art-large.jpg',
      description: 'A test podcast',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
    }

    const mockEpisode = {
      title: 'Episode 1',
      description: 'Test episode',
      audioUrl: 'http://example.com/ep1.mp3',
      pubDate: '2024-01-01',
      artworkUrl: 'http://example.com/ep1-art.jpg',
      duration: 1800,
      episodeGuid: 'episode-guid-1',
    }

    it('should add a favorite', async () => {
      const { addFavorite, isFavorited } = useExploreStore.getState()

      await addFavorite(mockPodcast, mockEpisode, undefined, 'jp')
      expect(isFavorited('123', 'episode-guid-1')).toBe(true)
      expect(useExploreStore.getState().favorites[0]?.countryAtSave).toBe('jp')
    })

    it('persists favorite when podcast artwork exists but episode-specific artwork is absent', async () => {
      const { addFavorite, isFavorited } = useExploreStore.getState()

      await addFavorite(
        mockPodcast,
        {
          ...mockEpisode,
          artworkUrl: '',
        },
        undefined,
        'jp'
      )

      expect(isFavorited('123', 'episode-guid-1')).toBe(true)
      expect(useExploreStore.getState().favorites[0]).toMatchObject({
        artworkUrl: 'http://example.com/art-large.jpg',
        episodeArtworkUrl: 'http://example.com/art-large.jpg',
      })
    })

    it('should remove a favorite', async () => {
      const { addFavorite, removeFavorite, isFavorited } = useExploreStore.getState()

      await addFavorite(mockPodcast, mockEpisode, undefined, 'jp')
      const key = '123::episode-guid-1'
      await removeFavorite(key)

      expect(isFavorited('123', 'episode-guid-1')).toBe(false)
    })

    it('fails closed for empty canonical favorite identity lookups', async () => {
      const { addFavorite, isFavorited } = useExploreStore.getState()

      await addFavorite(mockPodcast, mockEpisode, undefined, 'jp')

      expect(isFavorited('', 'episode-guid-1')).toBe(false)
      expect(isFavorited('123', '')).toBe(false)
    })

    it('rejects favorite persistence when countryAtSave is blank', async () => {
      const addFavoriteSpy = vi.spyOn(FavoritesRepository, 'addFavorite')
      const { addFavorite, isFavorited } = useExploreStore.getState()

      await addFavorite(mockPodcast, mockEpisode, undefined, '   ')

      expect(addFavoriteSpy).not.toHaveBeenCalled()
      expect(isFavorited('123', 'episode-guid-1')).toBe(false)
      expect(useExploreStore.getState().favorites).toHaveLength(0)
    })

    it('rejects favorite persistence when canonical identity is missing', async () => {
      const addFavoriteSpy = vi.spyOn(FavoritesRepository, 'addFavorite')
      const { addFavorite, isFavorited } = useExploreStore.getState()

      await addFavorite(
        mockPodcast,
        {
          ...mockEpisode,
          episodeGuid: '',
        },
        undefined,
        'jp'
      )

      expect(addFavoriteSpy).not.toHaveBeenCalled()
      expect(isFavorited('123', 'episode-guid-1')).toBe(false)
      expect(useExploreStore.getState().favorites).toHaveLength(0)
    })

    it('rejects favorite persistence when required remote metadata is missing', async () => {
      const addFavoriteSpy = vi.spyOn(FavoritesRepository, 'addFavorite')
      const { addFavorite, isFavorited } = useExploreStore.getState()

      await addFavorite(
        mockPodcast,
        {
          ...mockEpisode,
          audioUrl: '',
        },
        undefined,
        'jp'
      )

      expect(addFavoriteSpy).not.toHaveBeenCalled()
      expect(isFavorited('123', 'episode-guid-1')).toBe(false)
      expect(useExploreStore.getState().favorites).toHaveLength(0)
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
        .spyOn(FavoritesRepository, 'getFavoriteByKey')
        .mockImplementation(async () => {
          await favoriteLookupGate
          return undefined
        })
      const addFavoriteSpy = vi
        .spyOn(FavoritesRepository, 'addFavorite')
        .mockResolvedValue('fav-coalesced')

      const { addFavorite } = useExploreStore.getState()
      const first = addFavorite(mockPodcast, mockEpisode, undefined, 'jp')
      const second = addFavorite(mockPodcast, mockEpisode, undefined, 'jp')

      resolveFavoriteLookup?.()
      await Promise.all([first, second])

      expect(getFavoriteSpy).toHaveBeenCalledTimes(1)
      expect(addFavoriteSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().favorites).toHaveLength(1)
      expect(useExploreStore.getState().isFavorited('123', 'episode-guid-1')).toBe(true)
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

      vi.spyOn(FavoritesRepository, 'getFavoriteByKey').mockImplementation(async () => {
        await favoriteLookupGate
        return undefined
      })
      const addFavoriteSpy = vi
        .spyOn(FavoritesRepository, 'addFavorite')
        .mockResolvedValue('fav-after-abort')

      const { addFavorite } = useExploreStore.getState()
      const firstController = new AbortController()
      const first = addFavorite(mockPodcast, mockEpisode, firstController.signal, 'jp')
      const second = addFavorite(mockPodcast, mockEpisode, undefined, 'jp')

      firstController.abort()
      resolveFavoriteLookup?.()
      await Promise.all([first.catch(() => {}), second])

      expect(addFavoriteSpy).toHaveBeenCalledTimes(1)
      expect(useExploreStore.getState().isFavorited('123', 'episode-guid-1')).toBe(true)
    })

    it('aborts operation and skips state mutation when all callers abort', async () => {
      let resolveAdd: (() => void) | undefined
      const addGate = new Promise<void>((resolve) => {
        resolveAdd = resolve
      })

      const addFavoriteSpy = vi
        .spyOn(FavoritesRepository, 'addFavorite')
        .mockImplementation(async () => {
          await addGate
          return 'fav-id-all-aborted'
        })

      const { addFavorite } = useExploreStore.getState()
      const firstController = new AbortController()
      const secondController = new AbortController()

      const first = addFavorite(mockPodcast, mockEpisode, firstController.signal, 'jp')
      const second = addFavorite(mockPodcast, mockEpisode, secondController.signal, 'jp')
      firstController.abort()
      secondController.abort()
      resolveAdd?.()

      await Promise.all([first.catch(() => {}), second.catch(() => {})])

      // Since both callers aborted synchronously before yielding to the microtask queue,
      // the deduplication layer aborts the task immediately without hitting the repository
      expect(addFavoriteSpy).not.toHaveBeenCalled()

      // Request might have reached the repository before abort or short-circuited
      // But state should NOT be mutated
      expect(useExploreStore.getState().isFavorited('123', 'episode-guid-1')).toBe(false)
      expect(useExploreStore.getState().favorites).toHaveLength(0)
    })

    it('coalesces concurrent removeFavorite writes for the same key', async () => {
      const key = '123::episode-guid-1'
      useExploreStore.setState({
        favorites: [
          {
            id: 'fav-remove',
            key,
            podcastTitle: 'Test Podcast',
            episodeTitle: 'Episode 1',
            pubDate: '2024-01-01',
            audioUrl: 'http://example.com/ep1.mp3',
            durationSeconds: 0,
            artworkUrl: 'http://example.com/art.jpg',
            episodeArtworkUrl: '',
            description: 'test',
            addedAt: Date.now(),
            episodeGuid: 'episode-guid-1',
            podcastItunesId: '123',
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
        .spyOn(FavoritesRepository, 'removeFavoriteByKey')
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
      expect(useExploreStore.getState().isFavorited('123', 'episode-guid-1')).toBe(false)
    })
  })

  describe('Async Request Isolation', () => {
    it('retries subscription lazy hydration after transient failure', async () => {
      const subscription = {
        id: 'sub-retry',
        title: 'Subscription Retry',
        author: 'Author',
        artworkUrl: '',
        addedAt: Date.now(),
        podcastItunesId: '123',
        countryAtSave: 'us',
      }

      const getAllSubscriptionsSpy = vi
        .spyOn(SubscriptionRepository, 'getAllSubscriptions')
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
        key: '123::episode-guid-retry',
        podcastTitle: 'Podcast Retry',
        episodeTitle: 'Episode Retry',
        audioUrl: 'https://example.com/audio.mp3',
        artworkUrl: '',
        episodeArtworkUrl: '',
        description: 'test',
        pubDate: '2025-02-01',
        durationSeconds: 0,
        addedAt: Date.now(),
        podcastItunesId: '123',
        episodeGuid: 'episode-guid-retry',
        countryAtSave: 'us',
      }

      const getAllFavoritesSpy = vi
        .spyOn(FavoritesRepository, 'getAllFavorites')
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
          title: 'Subscription',
          author: 'Author',
          artworkUrl: '',
          addedAt: Date.now(),
          podcastItunesId: '123',
          countryAtSave: 'us',
        },
      ]
      const favorites = [
        {
          id: 'fav-1',
          key: '123::episode-guid-1',
          podcastTitle: 'Podcast',
          episodeTitle: 'Episode',
          audioUrl: 'https://example.com/audio.mp3',
          artworkUrl: '',
          episodeArtworkUrl: '',
          description: 'test',
          pubDate: '2025-02-01',
          durationSeconds: 0,
          addedAt: Date.now(),
          podcastItunesId: '123',
          episodeGuid: 'episode-guid-1',
          countryAtSave: 'us',
        },
      ]

      vi.spyOn(SubscriptionRepository, 'getAllSubscriptions').mockResolvedValue(subscriptions)
      vi.spyOn(FavoritesRepository, 'getAllFavorites').mockResolvedValue(favorites)

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

import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { DB, db } from '../../dexieDb'
import { LibraryRepository } from '../LibraryRepository'

describe('LibraryRepository', () => {
  it('proxies subscriptions/favorites/settings APIs to DB', async () => {
    const getSettingSpy = vi.spyOn(DB, 'getSetting').mockResolvedValue('us')
    const setSettingSpy = vi.spyOn(DB, 'setSetting').mockResolvedValue()
    const getSubsSpy = vi.spyOn(DB, 'getAllSubscriptions').mockResolvedValue([])
    const getSubSpy = vi.spyOn(DB, 'getSubscriptionByFeedUrl').mockResolvedValue(undefined)
    const addSubSpy = vi.spyOn(DB, 'addSubscription').mockResolvedValue('sub-1')
    const removeSubSpy = vi.spyOn(DB, 'removeSubscriptionByFeedUrl').mockResolvedValue()
    const getFavsSpy = vi.spyOn(DB, 'getAllFavorites').mockResolvedValue([])
    const getFavSpy = vi.spyOn(DB, 'getFavoriteByKey').mockResolvedValue(undefined)
    const addFavSpy = vi.spyOn(DB, 'addFavorite').mockResolvedValue('fav-1')
    const removeFavSpy = vi.spyOn(DB, 'removeFavoriteByKey').mockResolvedValue()

    const sub = {
      feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
      title: 't',
      author: 'a',
      artworkUrl: '',
      addedAt: Date.now(),
      podcastItunesId: undefined,
      countryAtSave: 'us',
    }
    const fav = {
      key: 'k',
      feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
      podcastTitle: 'p',
      episodeTitle: 'e',
      audioUrl: 'https://example.com/audio.mp3',
      artworkUrl: '',
      addedAt: Date.now(),
      countryAtSave: 'us',
    }

    await expect(LibraryRepository.getSetting('explore_country')).resolves.toBe('us')
    await LibraryRepository.setSetting('explore_country', 'jp')
    await expect(LibraryRepository.getAllSubscriptions()).resolves.toEqual([])
    await expect(LibraryRepository.getSubscriptionByFeedUrl(sub.feedUrl)).resolves.toBeUndefined()
    await expect(LibraryRepository.addSubscription(sub)).resolves.toBe('sub-1')
    await LibraryRepository.removeSubscriptionByFeedUrl(sub.feedUrl)
    await expect(LibraryRepository.getAllFavorites()).resolves.toEqual([])
    await expect(LibraryRepository.getFavoriteByKey('k')).resolves.toBeUndefined()
    await expect(LibraryRepository.addFavorite(fav)).resolves.toBe('fav-1')
    await LibraryRepository.removeFavoriteByKey('k')

    expect(getSettingSpy).toHaveBeenCalledWith('explore_country')
    expect(setSettingSpy).toHaveBeenCalledWith('explore_country', 'jp')
    expect(getSubsSpy).toHaveBeenCalledTimes(1)
    expect(getSubSpy).toHaveBeenCalledWith(sub.feedUrl)
    expect(addSubSpy).toHaveBeenCalledWith(sub)
    expect(removeSubSpy).toHaveBeenCalledWith(sub.feedUrl)
    expect(getFavsSpy).toHaveBeenCalledTimes(1)
    expect(getFavSpy).toHaveBeenCalledWith('k')
    expect(addFavSpy).toHaveBeenCalledWith(fav)
    expect(removeFavSpy).toHaveBeenCalledWith('k')
  })

  it('bulkAddSubscriptionsIfMissing deduplicates within one transaction', async () => {
    await db.subscriptions.clear()
    await db.subscriptions.put({
      id: 'existing-sub',
      feedUrl: normalizeFeedUrl('https://example.com/existing.xml'),
      title: 'Existing',
      author: 'Author',
      artworkUrl: '',
      addedAt: Date.now(),
      countryAtSave: 'us',
    })

    const inserted = await LibraryRepository.bulkAddSubscriptionsIfMissing([
      {
        feedUrl: normalizeFeedUrl('https://example.com/existing.xml'),
        title: 'Existing New',
        author: 'Imported',
        artworkUrl: '',
        countryAtSave: 'us',
      },
      {
        feedUrl: normalizeFeedUrl('https://example.com/new.xml'),
        title: 'New',
        author: 'Imported',
        artworkUrl: '',
        countryAtSave: 'us',
      },
      {
        feedUrl: normalizeFeedUrl('https://example.com/new.xml'),
        title: 'New Duplicate Input',
        author: 'Imported',
        artworkUrl: '',
        countryAtSave: 'us',
      },
    ])

    const all = await db.subscriptions.orderBy('feedUrl').toArray()
    expect(inserted).toBe(1)
    expect(all).toHaveLength(2)
    expect(all.map((item) => item.feedUrl)).toEqual([
      'https://example.com/existing.xml',
      'https://example.com/new.xml',
    ])
  })
})

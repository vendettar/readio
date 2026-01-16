// src/libs/recommended/types.ts

export interface RecommendedPodcast {
  id: string
  title: string
  author: string
  artworkUrl: string
  feedUrl: string
  genreNames: string[]
}

export interface RecommendedGroup {
  id: string
  label: string
  term: string
  items: RecommendedPodcast[]
}

export type CacheStatus = 'fresh' | 'stale' | 'expired'

export interface CacheResult<T> {
  data: T | null
  status: CacheStatus
  age: number
}

// Category IDs matching original
export const RECOMMENDED_CATEGORY_IDS = [
  'news',
  'technology',
  'comedy',
  'education',
  'arts',
  'business',
  'fiction',
  'government',
  'health-fitness',
  'history',
  'kids-family',
  'leisure',
  'music',
  'religion-spirituality',
  'science',
  'society-culture',
  'sports',
  'true-crime',
  'tv-film',
]

// Category labels and search terms
export const CATEGORY_INFO: Record<string, { label: string; term: string }> = {
  news: { label: 'News', term: 'news' },
  technology: { label: 'Technology', term: 'technology' },
  comedy: { label: 'Comedy', term: 'comedy' },
  education: { label: 'Education', term: 'education' },
  arts: { label: 'Arts', term: 'arts' },
  business: { label: 'Business', term: 'business' },
  fiction: { label: 'Fiction', term: 'fiction' },
  government: { label: 'Government', term: 'government' },
  'health-fitness': { label: 'Health & Fitness', term: 'health fitness' },
  history: { label: 'History', term: 'history' },
  'kids-family': { label: 'Kids & Family', term: 'kids family' },
  leisure: { label: 'Leisure', term: 'leisure' },
  music: { label: 'Music', term: 'music' },
  'religion-spirituality': { label: 'Religion & Spirituality', term: 'religion' },
  science: { label: 'Science', term: 'science' },
  'society-culture': { label: 'Society & Culture', term: 'society culture' },
  sports: { label: 'Sports', term: 'sports' },
  'true-crime': { label: 'True Crime', term: 'true crime' },
  'tv-film': { label: 'TV & Film', term: 'tv film' },
}

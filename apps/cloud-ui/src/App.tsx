import React, { useEffect, useState } from 'react'
import { AppHeader, AppShell, Button, Input, PagePanel } from '@readio/ui'

export const DISCOVERY_COUNTRY = 'us'
export const DISCOVERY_LOOKUP_LIMIT = 100

export const DISCOVERY_ENDPOINTS = {
  topPodcasts: '/api/v1/discovery/top-podcasts?country=us&limit=20',
  topEpisodes: '/api/v1/discovery/top-episodes?country=us&limit=20',
} as const

export const DISCOVERY_LOOKUP_ENDPOINTS = {
  podcast: (id: string) =>
    `/api/v1/discovery/lookup/podcast?id=${encodeURIComponent(id)}&country=${DISCOVERY_COUNTRY}`,
  podcastEpisodes: (id: string) =>
    `/api/v1/discovery/lookup/podcast-episodes?id=${encodeURIComponent(id)}&country=${DISCOVERY_COUNTRY}&limit=${DISCOVERY_LOOKUP_LIMIT}`,
} as const

export const DISCOVERY_SEARCH_ENDPOINTS = {
  podcasts: (term: string) =>
    `/api/v1/discovery/search/podcasts?term=${encodeURIComponent(term)}&country=${DISCOVERY_COUNTRY}&limit=20`,
  episodes: (term: string) =>
    `/api/v1/discovery/search/episodes?term=${encodeURIComponent(term)}&country=${DISCOVERY_COUNTRY}&limit=20`,
} as const

export const DISCOVERY_FEED_ENDPOINTS = {
  feed: (url: string) => `/api/v1/discovery/feed?url=${encodeURIComponent(url)}`,
} as const

type DiscoveryItem = {
  id: string
  name: string
  artistName?: string
  url: string
  artworkUrl100?: string
  providerPodcastId?: string
  providerEpisodeId?: string
}

type DiscoveryState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: DiscoveryItem[] }

type DiscoverySectionProps = {
  title: string
  endpoint: string
  loadingLabel: string
  emptyLabel: string
  state?: DiscoveryState
  onItemSelect?: (item: DiscoveryItem) => void
  actionLabel?: string
}

type PodcastDetail = {
  id: string
  name: string
  artistName?: string
  artworkUrl100?: string
  description?: string
  releaseDate?: string
  providerPodcastId?: string
}

type PodcastEpisode = {
  id: string
  name: string
  artistName?: string
  artworkUrl100?: string
  description?: string
  releaseDate?: string
  providerPodcastId?: string
  providerEpisodeId?: string
}

type DiscoveryFeedIdentity = {
  sourceUrl: string
  title: string
  subtitle?: string
  description?: string
  link?: string
  imageUrl?: string
  updatedAt?: string
}

type DiscoveryFeedEpisode = {
  id: string
  title: string
  description?: string
  link?: string
  audioUrl?: string
  publishedAt?: string
}

type PodcastDetailState =
  | { status: 'idle' }
  | { status: 'loading'; selected: DiscoveryItem }
  | { status: 'empty'; selected: DiscoveryItem; message: string }
  | { status: 'error'; selected: DiscoveryItem; message: string }
  | { status: 'ready'; selected: DiscoveryItem; podcast: PodcastDetail; episodes: PodcastEpisode[] }

type PodcastLookupResponse = {
  country?: string
  podcast?: unknown
}

type PodcastEpisodesLookupResponse = {
  country?: string
  limit?: number
  podcast?: unknown
  results?: unknown[]
}

type DiscoverySearchState =
  | { status: 'idle' }
  | { status: 'loading'; term: string }
  | { status: 'empty'; term: string }
  | { status: 'error'; term: string; message: string }
  | {
      status: 'ready'
      term: string
      podcasts: DiscoveryItem[]
      episodes: DiscoveryItem[]
    }

type DiscoveryFeedState =
  | { status: 'idle' }
  | { status: 'loading'; sourceUrl: string }
  | { status: 'empty'; feed: DiscoveryFeedIdentity; message: string }
  | { status: 'error'; sourceUrl: string; message: string }
  | { status: 'ready'; feed: DiscoveryFeedIdentity; episodes: DiscoveryFeedEpisode[] }

type CloudPage = 'home' | 'search' | 'feed' | 'detail'

class DiscoveryLookupNotFoundError extends Error {
  constructor() {
    super('podcast not found')
    this.name = 'DiscoveryLookupNotFoundError'
  }
}

class DiscoverySearchValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoverySearchValidationError'
  }
}

class DiscoveryFeedValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryFeedValidationError'
  }
}

function normalizeDiscoveryItems(payload: unknown): DiscoveryItem[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const results = Array.isArray((payload as { results?: unknown[] }).results)
    ? ((payload as { results: unknown[] }).results ?? [])
    : []

  return results
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const candidate = item as {
        id?: unknown
        name?: unknown
        artistName?: unknown
        url?: unknown
        artworkUrl100?: unknown
        providerPodcastId?: unknown
        providerEpisodeId?: unknown
      }

      const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
      const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''
      if (!id || !name || !url) {
        return null
      }

      return {
        id,
        name,
        artistName:
          typeof candidate.artistName === 'string' && candidate.artistName.trim()
            ? candidate.artistName.trim()
            : undefined,
        url,
        artworkUrl100:
          typeof candidate.artworkUrl100 === 'string' && candidate.artworkUrl100.trim()
            ? candidate.artworkUrl100.trim()
            : undefined,
        providerPodcastId:
          typeof candidate.providerPodcastId === 'string' && candidate.providerPodcastId.trim()
            ? candidate.providerPodcastId.trim()
            : undefined,
        providerEpisodeId:
          typeof candidate.providerEpisodeId === 'string' && candidate.providerEpisodeId.trim()
            ? candidate.providerEpisodeId.trim()
            : undefined,
      } as DiscoveryItem
    })
    .filter((item): item is DiscoveryItem => item !== null)
}

function normalizePodcastDetail(payload: unknown): PodcastDetail | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as {
    id?: unknown
    name?: unknown
    trackName?: unknown
    collectionName?: unknown
    artistName?: unknown
    artworkUrl100?: unknown
    description?: unknown
    longDescription?: unknown
    shortDescription?: unknown
    releaseDate?: unknown
    providerPodcastId?: unknown
    collectionId?: unknown
    trackId?: unknown
  }

  const id = firstNonEmpty(extractString(candidate.id), extractString(candidate.collectionId), extractString(candidate.trackId))
  const name = firstNonEmpty(extractString(candidate.name), extractString(candidate.trackName), extractString(candidate.collectionName))
  if (!id || !name) {
    return null
  }

  return {
    id,
    name,
    artistName: extractString(candidate.artistName) || undefined,
    artworkUrl100: extractString(candidate.artworkUrl100) || undefined,
    description:
      firstNonEmpty(
        extractString(candidate.longDescription),
        extractString(candidate.shortDescription),
        extractString(candidate.description)
      ) || undefined,
    releaseDate: extractString(candidate.releaseDate) || undefined,
    providerPodcastId: firstNonEmpty(extractString(candidate.providerPodcastId), extractString(candidate.collectionId), id),
  }
}

function normalizePodcastEpisodes(payload: unknown): PodcastEpisode[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const results = Array.isArray((payload as { results?: unknown[] }).results)
    ? ((payload as { results: unknown[] }).results ?? [])
    : []

  return results
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const candidate = item as {
        id?: unknown
        trackId?: unknown
        name?: unknown
        trackName?: unknown
        artistName?: unknown
        artworkUrl100?: unknown
        description?: unknown
        longDescription?: unknown
        shortDescription?: unknown
        releaseDate?: unknown
        providerPodcastId?: unknown
        collectionId?: unknown
        providerEpisodeId?: unknown
      }

      const id = firstNonEmpty(
        extractString(candidate.providerEpisodeId),
        extractString(candidate.trackId),
        extractString(candidate.id)
      )
      const name = firstNonEmpty(extractString(candidate.name), extractString(candidate.trackName))
      if (!id || !name) {
        return null
      }

      return {
        id,
        name,
        artistName: extractString(candidate.artistName) || undefined,
        artworkUrl100: extractString(candidate.artworkUrl100) || undefined,
        description:
          firstNonEmpty(
            extractString(candidate.longDescription),
            extractString(candidate.shortDescription),
            extractString(candidate.description)
          ) || undefined,
        releaseDate: extractString(candidate.releaseDate) || undefined,
        providerPodcastId:
          firstNonEmpty(
            extractString(candidate.providerPodcastId),
            extractString(candidate.collectionId)
          ) || undefined,
        providerEpisodeId: id,
      } as PodcastEpisode
    })
    .filter((item): item is PodcastEpisode => item !== null)
}

function normalizeDiscoveryFeed(
  payload: unknown
): { feed: DiscoveryFeedIdentity; episodes: DiscoveryFeedEpisode[] } | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as {
    sourceUrl?: unknown
    feed?: unknown
    episodes?: unknown[]
  }

  const feedCandidate =
    candidate.feed && typeof candidate.feed === 'object'
      ? (candidate.feed as {
          title?: unknown
          subtitle?: unknown
          description?: unknown
          link?: unknown
          imageUrl?: unknown
          updatedAt?: unknown
        })
      : null

  const sourceUrl = extractString(candidate.sourceUrl)
  const title = feedCandidate ? extractString(feedCandidate.title) : ''
  if (!sourceUrl || !title) {
    return null
  }

  const episodes = Array.isArray(candidate.episodes)
    ? candidate.episodes
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null
          }

          const episodeCandidate = item as {
            id?: unknown
            title?: unknown
            description?: unknown
            link?: unknown
            audioUrl?: unknown
            publishedAt?: unknown
          }

          const id = extractString(episodeCandidate.id)
          const episodeTitle = extractString(episodeCandidate.title)
          if (!id || !episodeTitle) {
            return null
          }

          return {
            id,
            title: episodeTitle,
            description: extractString(episodeCandidate.description) || undefined,
            link: extractString(episodeCandidate.link) || undefined,
            audioUrl: extractString(episodeCandidate.audioUrl) || undefined,
            publishedAt: extractString(episodeCandidate.publishedAt) || undefined,
          } as DiscoveryFeedEpisode
        })
        .filter((episode): episode is DiscoveryFeedEpisode => episode !== null)
    : []

  return {
    feed: {
      sourceUrl,
      title,
      subtitle: extractString(feedCandidate?.subtitle) || undefined,
      description: extractString(feedCandidate?.description) || undefined,
      link: extractString(feedCandidate?.link) || undefined,
      imageUrl: extractString(feedCandidate?.imageUrl) || undefined,
      updatedAt: extractString(feedCandidate?.updatedAt) || undefined,
    },
    episodes,
  }
}

function extractString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstNonEmpty(...values: string[]): string {
  for (const value of values) {
    if (value) {
      return value
    }
  }

  return ''
}

async function fetchDiscoveryJson(endpoint: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(endpoint, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.status === 404) {
    throw new DiscoveryLookupNotFoundError()
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return response.json() as Promise<unknown>
}

function normalizeDiscoveryFeedUrl(raw: string): string {
  const url = raw.trim()
  if (!url) {
    throw new DiscoveryFeedValidationError('Feed URL is required')
  }

  return url
}

function normalizeDiscoverySearchTerm(raw: string): string {
  const term = raw.trim()
  if (!term) {
    throw new DiscoverySearchValidationError('Search term is required')
  }

  return term
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DiscoveryLookupNotFoundError
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isSearchValidationError(error: unknown): boolean {
  return error instanceof DiscoverySearchValidationError
}

function isFeedValidationError(error: unknown): boolean {
  return error instanceof DiscoveryFeedValidationError
}

function errorMessage(error: unknown, fallback = 'Unable to load podcast detail'): string {
  return error instanceof Error ? error.message : fallback
}

function isFulfilledResult<T>(
  result: PromiseSettledResult<T>
): result is PromiseFulfilledResult<T> {
  return result.status === 'fulfilled'
}

function isRejectedResult<T>(
  result: PromiseSettledResult<T>
): result is PromiseRejectedResult {
  return result.status === 'rejected'
}

function ShellNav({
  page,
  hasSelectedPodcast,
  onNavigate,
}: {
  page: CloudPage
  hasSelectedPodcast: boolean
  onNavigate: (nextPage: CloudPage) => void
}) {
  const items: Array<{ page: CloudPage; label: string; disabled?: boolean }> = [
    { page: 'home', label: 'Home' },
    { page: 'search', label: 'Search' },
    { page: 'feed', label: 'Feed' },
    { page: 'detail', label: 'Detail', disabled: !hasSelectedPodcast },
  ]

  return (
    <nav className="cloud-shell__nav" aria-label="Cloud pages">
      {items.map((item) => (
        <Button
          key={item.page}
          variant={page === item.page ? 'outline' : 'ghost'}
          size="sm"
          className="cloud-shell__nav-button"
          aria-current={page === item.page ? 'page' : undefined}
          disabled={item.disabled}
          onClick={() => onNavigate(item.page)}
        >
          {item.label}
        </Button>
      ))}
    </nav>
  )
}

export function DiscoverySectionView({
  title,
  loadingLabel,
  emptyLabel,
  state = { status: 'loading' },
  onItemSelect,
  actionLabel = 'Open details',
}: Pick<
  DiscoverySectionProps,
  'title' | 'loadingLabel' | 'emptyLabel' | 'state' | 'onItemSelect' | 'actionLabel'
>) {
  return (
    <section className="cloud-card">
      <p className="cloud-card__kicker">Cloud discovery</p>
      <h2 className="cloud-card__title">{title}</h2>

      {state.status === 'loading' ? <p className="cloud-card__body">{loadingLabel}</p> : null}

      {state.status === 'error' ? (
        <p className="cloud-card__body" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'empty' ? <p className="cloud-card__body">{emptyLabel}</p> : null}

      {state.status === 'ready' ? (
        <ul className="cloud-list" aria-label={title}>
          {state.items.map((item) => (
            <li key={item.id} className="cloud-list__item">
              <div className="cloud-list__item-body">
                <span className="cloud-list__title">{item.name}</span>
                {item.artistName ? <span className="cloud-list__meta">{item.artistName}</span> : null}
              </div>
              {onItemSelect ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onItemSelect(item)}
                >
                  {actionLabel}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function DiscoverySection({ title, endpoint, loadingLabel, emptyLabel, onItemSelect, actionLabel }: DiscoverySectionProps) {
  const [state, setState] = useState<DiscoveryState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setState({ status: 'loading' })

    fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        return response.json() as Promise<unknown>
      })
      .then((payload) => {
        if (!active) {
          return
        }

        const items = normalizeDiscoveryItems(payload)
        setState(items.length > 0 ? { status: 'ready', items } : { status: 'empty' })
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }

        if (isAbortError(error)) {
          return
        }

        setState({ status: 'error', message: errorMessage(error) })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [endpoint])

  return (
    <DiscoverySectionView
      title={title}
      loadingLabel={loadingLabel}
      emptyLabel={emptyLabel}
      state={state}
      onItemSelect={onItemSelect}
      actionLabel={actionLabel}
    />
  )
}

function SearchSection({
  onPodcastSelect,
}: {
  onPodcastSelect: (podcast: DiscoveryItem) => void
}) {
  const [rawTerm, setRawTerm] = useState('')
  const [state, setState] = useState<DiscoverySearchState>({ status: 'idle' })

  useEffect(() => {
    if (state.status !== 'loading') {
      return
    }

    const controller = new AbortController()
    let active = true

    const term = state.term
    const podcastsEndpoint = DISCOVERY_SEARCH_ENDPOINTS.podcasts(term)
    const episodesEndpoint = DISCOVERY_SEARCH_ENDPOINTS.episodes(term)

    Promise.all([
      fetchDiscoveryJson(podcastsEndpoint, controller.signal),
      fetchDiscoveryJson(episodesEndpoint, controller.signal),
    ])
      .then(([podcastsPayload, episodesPayload]) => {
        if (!active) {
          return
        }

        const podcasts = normalizeDiscoveryItems(podcastsPayload)
        const episodes = normalizeDiscoveryItems(episodesPayload)
        if (podcasts.length === 0 && episodes.length === 0) {
          setState({ status: 'empty', term })
          return
        }

        setState({
          status: 'ready',
          term,
          podcasts,
          episodes,
        })
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }

        if (isAbortError(error)) {
          return
        }

        setState({
          status: 'error',
          term,
          message: errorMessage(error),
        })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [state])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      const term = normalizeDiscoverySearchTerm(rawTerm)
      setState({ status: 'loading', term })
    } catch (error) {
      if (isSearchValidationError(error)) {
        setState({
          status: 'error',
          term: '',
          message: (error as Error).message,
        })
        return
      }

      throw error
    }
  }

  return (
    <section className="cloud-card cloud-card--search">
      <p className="cloud-card__kicker">Cloud search</p>
      <h2 className="cloud-card__title">Search podcasts and episodes</h2>

      <form className="cloud-search" onSubmit={handleSubmit}>
        <label className="cloud-search__label" htmlFor="cloud-search-term">
          Search term
        </label>
        <div className="cloud-search__row">
          <Input
            id="cloud-search-term"
            name="term"
            type="search"
            value={rawTerm}
            onChange={(event) => setRawTerm(event.target.value)}
            placeholder="Search for a podcast or episode"
          />
          <Button type="submit">
            Search
          </Button>
        </div>
      </form>

      {state.status === 'idle' ? (
        <p className="cloud-card__body">Search the same-origin Cloud backend to find podcasts and episodes.</p>
      ) : null}

      {state.status === 'loading' ? (
        <p className="cloud-card__body">Searching for {state.term}...</p>
      ) : null}

      {state.status === 'empty' ? (
        <p className="cloud-card__body">No search results were found for {state.term}.</p>
      ) : null}

      {state.status === 'error' ? (
        <p className="cloud-card__body" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'ready' ? (
        <div className="cloud-search__results">
          <DiscoverySectionView
            title={`Podcast results for ${state.term}`}
            loadingLabel=""
            emptyLabel=""
            state={state.podcasts.length > 0 ? { status: 'ready', items: state.podcasts } : { status: 'empty' }}
            onItemSelect={onPodcastSelect}
            actionLabel="Open search detail"
          />
          <DiscoverySectionView
            title={`Episode results for ${state.term}`}
            loadingLabel=""
            emptyLabel=""
            state={state.episodes.length > 0 ? { status: 'ready', items: state.episodes } : { status: 'empty' }}
          />
        </div>
      ) : null}
    </section>
  )
}

function FeedSection() {
  const [rawUrl, setRawUrl] = useState('')
  const [state, setState] = useState<DiscoveryFeedState>({ status: 'idle' })

  useEffect(() => {
    if (state.status !== 'loading') {
      return
    }

    const controller = new AbortController()
    let active = true

    const sourceUrl = state.sourceUrl
    const endpoint = DISCOVERY_FEED_ENDPOINTS.feed(sourceUrl)

    fetchDiscoveryJson(endpoint, controller.signal)
      .then((payload) => {
        if (!active) {
          return
        }

        const normalized = normalizeDiscoveryFeed(payload)
        if (!normalized) {
          setState({
            status: 'error',
            sourceUrl,
            message: 'Unable to load feed',
          })
          return
        }

        if (normalized.episodes.length === 0) {
          setState({
            status: 'empty',
            feed: normalized.feed,
            message: 'No feed episodes are available yet.',
          })
          return
        }

        setState({
          status: 'ready',
          feed: normalized.feed,
          episodes: normalized.episodes,
        })
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }

        if (isAbortError(error)) {
          return
        }

        setState({
          status: 'error',
          sourceUrl,
          message: errorMessage(error, 'Unable to load feed'),
        })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [state])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      const sourceUrl = normalizeDiscoveryFeedUrl(rawUrl)
      setState({ status: 'loading', sourceUrl })
    } catch (error) {
      if (isFeedValidationError(error)) {
        setState({
          status: 'error',
          sourceUrl: '',
          message: (error as Error).message,
        })
        return
      }

      throw error
    }
  }

  return (
    <section className="cloud-card cloud-card--feed">
      <p className="cloud-card__kicker">Cloud feed</p>
      <h2 className="cloud-card__title">Feed parsing</h2>

      <form className="cloud-search" onSubmit={handleSubmit}>
        <label className="cloud-search__label" htmlFor="cloud-feed-url">
          Feed URL
        </label>
        <div className="cloud-search__row">
          <Input
            id="cloud-feed-url"
            name="url"
            type="url"
            value={rawUrl}
            onChange={(event) => setRawUrl(event.target.value)}
            placeholder="https://example.com/feed.xml"
          />
          <Button type="submit">
            Load feed
          </Button>
        </div>
      </form>

      {state.status === 'idle' ? (
        <p className="cloud-card__body">
          Paste a feed URL to load normalized episodes through the same-origin Cloud backend.
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <p className="cloud-card__body">Loading feed from {state.sourceUrl}...</p>
      ) : null}

      {state.status === 'error' ? (
        <p className="cloud-card__body" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'empty' ? (
        <div className="cloud-feed__empty">
          <div className="cloud-feed__summary">
            <h3 className="cloud-card__title">{state.feed.title}</h3>
            {state.feed.subtitle ? <p className="cloud-card__body">{state.feed.subtitle}</p> : null}
            {state.feed.description ? <p className="cloud-card__body">{state.feed.description}</p> : null}
            <p className="cloud-card__body">Source {state.feed.sourceUrl}</p>
            {state.feed.updatedAt ? <p className="cloud-card__body">Updated {state.feed.updatedAt}</p> : null}
          </div>
          <p className="cloud-card__body">{state.message}</p>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div className="cloud-feed__layout">
          <div className="cloud-feed__summary">
            <h3 className="cloud-card__title">{state.feed.title}</h3>
            {state.feed.subtitle ? <p className="cloud-card__body">{state.feed.subtitle}</p> : null}
            {state.feed.description ? <p className="cloud-card__body">{state.feed.description}</p> : null}
            <p className="cloud-card__body">Source {state.feed.sourceUrl}</p>
            {state.feed.link ? <p className="cloud-card__body">Link {state.feed.link}</p> : null}
            {state.feed.updatedAt ? <p className="cloud-card__body">Updated {state.feed.updatedAt}</p> : null}
          </div>

          <section className="cloud-feed__episodes">
            <h3 className="cloud-card__title">Episodes</h3>
            <ul className="cloud-list cloud-feed__episode-list" aria-label="Feed episodes">
              {state.episodes.map((episode) => (
                <li key={episode.id} className="cloud-list__item">
                  <div className="cloud-list__item-body">
                    <span className="cloud-list__title">{episode.title}</span>
                    {episode.description ? <span className="cloud-list__meta">{episode.description}</span> : null}
                    {episode.publishedAt ? (
                      <span className="cloud-list__meta">Released {episode.publishedAt}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function HomePage({
  onPodcastSelect,
}: {
  onPodcastSelect: (podcast: DiscoveryItem) => void
}) {
  return (
    <PagePanel
      kicker="Current state"
      title="Home"
      description="Discovery starts on the server and the home page keeps the same-origin top lists in view."
      className="cloud-page"
    >
      <div className="cloud-page__content">
        <p className="cloud-card__body">
          This homepage loads Cloud discovery data from same-origin backend APIs and opens a
          local podcast detail flow without leaving the app.
        </p>
        <section className="cloud-grid">
          <DiscoverySection
            title="Top podcasts"
            endpoint={DISCOVERY_ENDPOINTS.topPodcasts}
            loadingLabel="Loading top podcasts..."
            emptyLabel="No top podcasts are available yet."
            onItemSelect={onPodcastSelect}
            actionLabel="Open detail"
          />
          <DiscoverySection
            title="Top episodes"
            endpoint={DISCOVERY_ENDPOINTS.topEpisodes}
            loadingLabel="Loading top episodes..."
            emptyLabel="No top episodes are available yet."
          />
        </section>
      </div>
    </PagePanel>
  )
}

function SearchPage({
  onPodcastSelect,
}: {
  onPodcastSelect: (podcast: DiscoveryItem) => void
}) {
  return (
    <PagePanel
      kicker="Cloud search"
      title="Search podcasts and episodes"
      description="Search runs through the same-origin backend and can open a Cloud detail view."
      className="cloud-page"
    >
      <SearchSection onPodcastSelect={onPodcastSelect} />
    </PagePanel>
  )
}

function FeedPage() {
  return (
    <PagePanel
      kicker="Cloud feed"
      title="Feed parsing"
      description="Paste a feed URL to load normalized episodes through the same-origin Cloud backend."
      className="cloud-page"
    >
      <FeedSection />
    </PagePanel>
  )
}

function DetailPage({
  selectedPodcast,
  onClearSelection,
}: {
  selectedPodcast: DiscoveryItem | null
  onClearSelection: () => void
}) {
  return (
    <PagePanel
      kicker="Podcast detail"
      title="Detail"
      description="Open a podcast from a same-origin discovery or search result to inspect the Cloud lookup response."
      className="cloud-page"
    >
      <PodcastDetailSection selectedPodcast={selectedPodcast} onClearSelection={onClearSelection} />
    </PagePanel>
  )
}

function PodcastDetailSection({
  selectedPodcast,
  onClearSelection,
}: {
  selectedPodcast: DiscoveryItem | null
  onClearSelection: () => void
}) {
  const [state, setState] = useState<PodcastDetailState>({ status: 'idle' })

  useEffect(() => {
    if (!selectedPodcast) {
      setState({ status: 'idle' })
      return
    }

    const controller = new AbortController()
    let active = true

    setState({ status: 'loading', selected: selectedPodcast })

    const podcastId = selectedPodcast.providerPodcastId ?? selectedPodcast.id
    const podcastEndpoint = DISCOVERY_LOOKUP_ENDPOINTS.podcast(podcastId)
    const episodesEndpoint = DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes(podcastId)

    Promise.allSettled([
      fetchDiscoveryJson(podcastEndpoint, controller.signal),
      fetchDiscoveryJson(episodesEndpoint, controller.signal),
    ]).then((settled) => {
      if (!active) {
        return
      }

      const rejectedResults = settled.filter(isRejectedResult)
      if (rejectedResults.length > 0) {
        if (rejectedResults.some((result) => isAbortError(result.reason))) {
          return
        }

        if (rejectedResults.some((result) => !isNotFoundError(result.reason))) {
          setState({
            status: 'error',
            selected: selectedPodcast,
            message: errorMessage(rejectedResults[0].reason),
          })
          return
        }

        setState({
          status: 'empty',
          selected: selectedPodcast,
          message: `No podcast detail is available yet for ${selectedPodcast.name}.`,
        })
        return
      }

      const podcastPayload = isFulfilledResult(settled[0])
        ? (settled[0].value as PodcastLookupResponse)
        : null
      const episodesPayload =
        isFulfilledResult(settled[1]) ? (settled[1].value as PodcastEpisodesLookupResponse) : null

      const podcast = normalizePodcastDetail(podcastPayload?.podcast ?? podcastPayload)
      if (!podcast) {
        setState({
          status: 'empty',
          selected: selectedPodcast,
          message: `No podcast detail is available yet for ${selectedPodcast.name}.`,
        })
        return
      }

      const episodes = normalizePodcastEpisodes(episodesPayload)
      setState({
        status: 'ready',
        selected: selectedPodcast,
        podcast,
        episodes,
      })
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [selectedPodcast])

  if (!selectedPodcast) {
    return (
      <section className="cloud-card cloud-card--detail">
        <p className="cloud-card__kicker">Podcast detail</p>
        <h2 className="cloud-card__title">Select a podcast</h2>
        <p className="cloud-card__body">
          Open a podcast from the top podcasts list to load the same-origin lookup detail flow.
        </p>
      </section>
    )
  }

  return (
    <section className="cloud-card cloud-card--detail">
      <div className="cloud-detail__header">
        <div>
          <p className="cloud-card__kicker">Podcast detail</p>
          <h2 className="cloud-card__title">{selectedPodcast.name}</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClearSelection}>
          Back to list
        </Button>
      </div>

      {state.status === 'loading' ? (
        <p className="cloud-card__body">{`Loading ${selectedPodcast.name} details...`}</p>
      ) : null}

      {state.status === 'empty' ? (
        <p className="cloud-card__body" role="status">
          {state.message}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p className="cloud-card__body" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'ready' ? (
        <div className="cloud-detail__layout">
          <div className="cloud-detail__summary">
            <div className="cloud-detail__artwork" aria-hidden="true">
              {initialsForPodcast(state.podcast.name)}
            </div>
            <div className="cloud-detail__meta">
              <h3 className="cloud-detail__subtitle">{state.podcast.name}</h3>
              {state.podcast.artistName ? <p className="cloud-card__body">{state.podcast.artistName}</p> : null}
              {state.podcast.description ? (
                <p className="cloud-card__body">{state.podcast.description}</p>
              ) : null}
              {state.podcast.releaseDate ? (
                <p className="cloud-card__body">Released {state.podcast.releaseDate}</p>
              ) : null}
            </div>
          </div>

          <section className="cloud-detail__episodes">
            <h3 className="cloud-card__title">Episodes</h3>
            {state.episodes.length === 0 ? (
              <p className="cloud-card__body">No episodes are available yet.</p>
            ) : (
              <ul className="cloud-list cloud-detail__episode-list" aria-label="Podcast episodes">
                {state.episodes.map((episode) => (
                  <li key={episode.id} className="cloud-list__item">
                    <div className="cloud-list__item-body">
                      <span className="cloud-list__title">{episode.name}</span>
                      {episode.artistName ? <span className="cloud-list__meta">{episode.artistName}</span> : null}
                      {episode.releaseDate ? (
                        <span className="cloud-list__meta">Released {episode.releaseDate}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </section>
  )
}

function initialsForPodcast(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (words.length === 0) {
    return 'RC'
  }

  const initials = words.map((word) => word[0]?.toUpperCase() ?? '').join('')
  return initials || 'RC'
}

export function App() {
  const [page, setPage] = useState<CloudPage>('home')
  const [selectedPodcast, setSelectedPodcast] = useState<DiscoveryItem | null>(null)
  const [detailReturnPage, setDetailReturnPage] = useState<Exclude<CloudPage, 'detail'>>('home')

  function navigateTo(nextPage: Exclude<CloudPage, 'detail'>) {
    setSelectedPodcast(null)
    setPage(nextPage)
  }

  function openPodcastDetail(podcast: DiscoveryItem, returnPage: Exclude<CloudPage, 'detail'>) {
    setSelectedPodcast(podcast)
    setDetailReturnPage(returnPage)
    setPage('detail')
  }

  function clearPodcastDetail() {
    setSelectedPodcast(null)
    setPage(detailReturnPage)
  }

  return (
    <AppShell className="cloud-shell">
      <AppHeader
        className="cloud-shell__header"
        eyebrow="Readio Cloud"
        title="Discovery starts on the server"
        description="Same-origin top podcasts, detail, search, and feed."
        actions={
          <>
            <span className="cloud-shell__badge">same-origin only</span>
            <ShellNav
              page={page}
              hasSelectedPodcast={Boolean(selectedPodcast)}
              onNavigate={(nextPage) => {
                if (nextPage === 'detail') {
                  return
                }

                navigateTo(nextPage)
              }}
            />
          </>
        }
      />

      <main className="cloud-shell__main">
        {page === 'home' ? <HomePage onPodcastSelect={(podcast) => openPodcastDetail(podcast, 'home')} /> : null}
        {page === 'search' ? (
          <SearchPage onPodcastSelect={(podcast) => openPodcastDetail(podcast, 'search')} />
        ) : null}
        {page === 'feed' ? <FeedPage /> : null}
        {page === 'detail' ? (
          <DetailPage selectedPodcast={selectedPodcast} onClearSelection={clearPodcastDetail} />
        ) : null}
      </main>
    </AppShell>
  )
}

import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  App,
  DISCOVERY_ENDPOINTS,
  DISCOVERY_FEED_ENDPOINTS,
  DISCOVERY_LOOKUP_ENDPOINTS,
  DISCOVERY_SEARCH_ENDPOINTS,
} from './App'

type AppSession = {
  root: Root
  container: HTMLDivElement
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function mountApp(): AppSession {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { root, container }
}

async function renderApp(fetchMock: typeof fetch) {
  const session = mountApp()
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchMock

  await act(async () => {
    session.root.render(<App />)
  })

  return {
    ...session,
    restore: async () => {
      await act(async () => {
        session.root.unmount()
      })

      globalThis.fetch = originalFetch
      document.body.innerHTML = ''
    },
  }
}

function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === name
  )

  assert.ok(button, `expected button ${name}`)

  button!.click()
}

function clickNav(container: HTMLElement, name: string) {
  const nav = container.querySelector('nav[aria-label="Cloud pages"]')
  assert.ok(nav, 'expected cloud pages nav')

  const button = Array.from(nav!.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === name
  )

  assert.ok(button, `expected nav button ${name}`)

  button!.click()
}

function clickButtonInSection(container: HTMLElement, heading: string, name: string) {
  const section = Array.from(container.querySelectorAll('section')).find((candidate) =>
    candidate.textContent?.includes(heading)
  )

  assert.ok(section, `expected section ${heading}`)

  const button = Array.from(section!.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === name
  )

  assert.ok(button, `expected button ${name} in section ${heading}`)

  button!.click()
}

function findInput(container: HTMLElement, label: string) {
  const labelElement = Array.from(container.querySelectorAll('label')).find(
    (candidate) => candidate.textContent?.trim() === label
  )

  assert.ok(labelElement, `expected label ${label}`)

  const id = labelElement!.getAttribute('for')
  assert.ok(id, `expected ${label} to reference an input`)

  const input = container.ownerDocument.getElementById(id!) as HTMLInputElement | null
  assert.ok(input, `expected input ${id}`)
  return input!
}

function setInputValue(input: HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(input)
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  assert.ok(descriptor?.set, 'expected input value setter')
  descriptor!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test.afterEach(() => {
  document.body.innerHTML = ''
})

test('App renders shared Button and Input primitives from @readio/ui', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(jsonResponse({ results: [] }))
      episodes.resolve(jsonResponse({ results: [] }))
      await flush()
    })

    const homeNavButton = Array.from(session.container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Search'
    )
    assert.ok(homeNavButton, 'expected shared nav button')
    assert.match(homeNavButton.className, /inline-flex/)
    assert.match(homeNavButton.className, /cloud-shell__nav-button/)
    assert.doesNotMatch(homeNavButton.className, /ui-button/)

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    const searchInput = findInput(session.container, 'Search term')
    assert.match(searchInput.className, /border-input/)
    assert.match(searchInput.className, /focus-visible:ring-1/)
    assert.doesNotMatch(searchInput.className, /ui-input/)
  } finally {
    await session.restore()
  }
})

test('App shell navigates between home search feed and detail page shells', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(
        jsonResponse({
          results: [
            {
              id: '201',
              name: 'Cloud Top Episodes',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id201',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    assert.ok(session.container.textContent?.includes('Home'))
    assert.ok(session.container.textContent?.includes('Top podcasts'))

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    assert.ok(session.container.textContent?.includes('Search podcasts and episodes'))
    assert.ok(session.container.textContent?.includes('Search term'))

    await act(async () => {
      clickNav(session.container, 'Feed')
      await flush()
    })

    assert.ok(session.container.textContent?.includes('Feed parsing'))
    assert.ok(session.container.textContent?.includes('Feed URL'))

    await act(async () => {
      clickNav(session.container, 'Home')
      await flush()
    })

    assert.ok(session.container.textContent?.includes('Top podcasts'))
    assert.deepEqual(
      Array.from(new Set(requested)).sort(),
      [DISCOVERY_ENDPOINTS.topEpisodes, DISCOVERY_ENDPOINTS.topPodcasts].sort()
    )
  } finally {
    await session.restore()
  }
})

test('App requests same-origin discovery and lookup endpoints and renders podcast detail', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const detailPodcast = createDeferred<Response>()
  const detailEpisodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcast('101')) return detailPodcast.promise
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101')) return detailEpisodes.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(
        jsonResponse({
          results: [
            {
              id: '201',
              name: 'Cloud Top Episodes',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id201',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    assert.ok(session.container.textContent?.includes('Cloud Top Podcasts'))
    assert.ok(session.container.textContent?.includes('Cloud Top Episodes'))
    assert.ok(session.container.textContent?.includes('Open detail'))

    await act(async () => {
      clickButton(session.container, 'Open detail')
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_LOOKUP_ENDPOINTS.podcast('101'),
        DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101'),
      ].sort()
    )
    assert.ok(session.container.textContent?.includes('Loading Cloud Top Podcasts details...'))

    await act(async () => {
      detailPodcast.resolve(
        jsonResponse({
          country: 'us',
          podcast: {
            id: '101',
            name: 'Cloud Podcast Detail',
            artistName: 'Readio',
            artworkUrl100: 'https://example.com/podcast.jpg',
            description: 'Podcast summary',
            releaseDate: '2024-02-03',
            providerPodcastId: '101',
          },
        })
      )
      detailEpisodes.resolve(
        jsonResponse({
          country: 'us',
          limit: 100,
          podcast: {
            id: '101',
            name: 'Cloud Podcast Detail',
            artistName: 'Readio',
            artworkUrl100: 'https://example.com/podcast.jpg',
            description: 'Podcast summary',
            releaseDate: '2024-02-03',
            providerPodcastId: '101',
          },
          results: [
            {
              id: '201',
              name: 'Episode One',
              artistName: 'Readio',
              artworkUrl100: 'https://example.com/episode-1.jpg',
              description: 'Episode one summary',
              releaseDate: '2024-02-04',
              providerPodcastId: '101',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    const html = session.container.innerHTML
    assert.ok(html.includes('Cloud Podcast Detail'))
    assert.ok(html.includes('Readio'))
    assert.ok(html.includes('Podcast summary'))
    assert.ok(html.includes('Episode One'))
    assert.ok(html.includes('Released 2024-02-04'))
    assert.ok(!html.includes('href='))
    assert.ok(!html.includes('podcasts.apple.com'))
    assert.ok(!html.includes('itunes.apple.com'))
    assert.equal(session.container.querySelector('a[href*="apple.com"]'), null)
  } finally {
    await session.restore()
  }
})

test('App renders detail empty state when podcast lookup is missing', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcast('101')) {
      return Promise.resolve(
        new Response('', {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )
    }
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101')) {
      return Promise.resolve(
        jsonResponse({
          country: 'us',
          limit: 100,
          podcast: {
            id: '101',
            name: 'Cloud Podcast Detail',
            artistName: 'Readio',
            providerPodcastId: '101',
          },
          results: [],
        })
      )
    }

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(jsonResponse({ results: [] }))
      await flush()
    })

    await act(async () => {
      clickButton(session.container, 'Open detail')
      await flush()
    })

    await act(async () => {
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_LOOKUP_ENDPOINTS.podcast('101'),
        DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101'),
      ].sort()
    )
    assert.ok(
      session.container.textContent?.includes('No podcast detail is available yet for Cloud Top Podcasts.')
    )
  } finally {
    await session.restore()
  }
})

test('App renders detail error state when episode lookup fails', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcast('101')) {
      return Promise.resolve(
        jsonResponse({
          country: 'us',
          podcast: {
            id: '101',
            name: 'Cloud Podcast Detail',
            artistName: 'Readio',
            providerPodcastId: '101',
          },
        })
      )
    }
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101')) {
      return Promise.resolve(
        jsonResponse(
          {
            error: 'upstream failed',
          },
          502
        )
      )
    }

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(jsonResponse({ results: [] }))
      await flush()
    })

    await act(async () => {
      clickButton(session.container, 'Open detail')
      await flush()
    })

    await act(async () => {
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_LOOKUP_ENDPOINTS.podcast('101'),
        DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101'),
      ].sort()
    )
    assert.ok(session.container.textContent?.includes('Request failed with status 502'))
  } finally {
    await session.restore()
  }
})

test('App renders episode empty state when podcast episodes response is empty', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const detailPodcast = createDeferred<Response>()
  const detailEpisodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcast('101')) return detailPodcast.promise
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101')) return detailEpisodes.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(
        jsonResponse({
          results: [
            {
              id: '201',
              name: 'Cloud Top Episodes',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id201',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    await act(async () => {
      clickButton(session.container, 'Open detail')
      await flush()
    })

    await act(async () => {
      detailPodcast.resolve(
        jsonResponse({
          country: 'us',
          podcast: {
            id: '101',
            name: 'Cloud Podcast Detail',
            artistName: 'Readio',
            artworkUrl100: 'https://example.com/podcast.jpg',
            description: 'Podcast summary',
            releaseDate: '2024-02-03',
            providerPodcastId: '101',
          },
        })
      )
      detailEpisodes.resolve(
        jsonResponse({
          country: 'us',
          limit: 100,
          podcast: {
            id: '101',
            name: 'Cloud Podcast Detail',
            artistName: 'Readio',
            artworkUrl100: 'https://example.com/podcast.jpg',
            description: 'Podcast summary',
            releaseDate: '2024-02-03',
            providerPodcastId: '101',
          },
          results: [],
        })
      )
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_LOOKUP_ENDPOINTS.podcast('101'),
        DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101'),
      ].sort()
    )
    assert.ok(session.container.textContent?.includes('Cloud Podcast Detail'))
    assert.ok(session.container.textContent?.includes('No episodes are available yet.'))
    assert.ok(!session.container.innerHTML.includes('href='))
    assert.equal(session.container.querySelector('a[href*="apple.com"]'), null)
  } finally {
    await session.restore()
  }
})

test('App feed flow calls same-origin feed endpoint and renders normalized feed episodes', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const feed = createDeferred<Response>()
  const requested: string[] = []
  const feedUrl = 'https://feeds.example.com/feed.xml'

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_FEED_ENDPOINTS.feed(feedUrl)) return feed.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(jsonResponse({ results: [] }))
      episodes.resolve(jsonResponse({ results: [] }))
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Feed')
      await flush()
    })

    const input = findInput(session.container, 'Feed URL')

    await act(async () => {
      setInputValue(input, feedUrl)
      clickButtonInSection(session.container, 'Feed parsing', 'Load feed')
      await flush()
    })

    assert.ok(session.container.textContent?.includes(`Loading feed from ${feedUrl}...`))
    assert.ok(requested.includes(DISCOVERY_FEED_ENDPOINTS.feed(feedUrl)))

    await act(async () => {
      feed.resolve(
        jsonResponse({
          sourceUrl: feedUrl,
          feed: {
            title: 'Cloud Feed',
            subtitle: 'Cloud feed summary',
            description: 'Cloud feed summary',
            link: 'https://example.com/feed',
            imageUrl: 'https://example.com/feed.jpg',
            updatedAt: '2024-02-05',
          },
          episodes: [
            {
              id: 'feed-1',
              title: 'Episode One',
              description: 'Episode one summary',
              link: 'https://example.com/feed/episode-1',
              audioUrl: 'https://example.com/audio-1.mp3',
              publishedAt: '2024-02-04',
            },
          ],
        })
      )
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_FEED_ENDPOINTS.feed(feedUrl),
      ].sort()
    )
    assert.ok(session.container.textContent?.includes('Cloud Feed'))
    assert.ok(session.container.textContent?.includes('Cloud feed summary'))
    assert.ok(session.container.textContent?.includes('Episode One'))
    assert.ok(session.container.textContent?.includes('Released 2024-02-04'))
    assert.ok(session.container.textContent?.includes(`Source ${feedUrl}`))
    assert.ok(!session.container.innerHTML.includes('href='))
    assert.equal(session.container.querySelector('a[href*="apple.com"]'), null)
  } finally {
    await session.restore()
  }
})

test('App feed renders empty state when backend returns no episodes', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const feed = createDeferred<Response>()
  const requested: string[] = []
  const feedUrl = 'https://feeds.example.com/feed.xml'

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_FEED_ENDPOINTS.feed(feedUrl)) return feed.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(jsonResponse({ results: [] }))
      episodes.resolve(jsonResponse({ results: [] }))
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Feed')
      await flush()
    })

    const input = findInput(session.container, 'Feed URL')

    await act(async () => {
      setInputValue(input, feedUrl)
      clickButtonInSection(session.container, 'Feed parsing', 'Load feed')
      await flush()
    })

    await act(async () => {
      feed.resolve(
        jsonResponse({
          sourceUrl: feedUrl,
          feed: {
            title: 'Cloud Feed',
            subtitle: 'Cloud feed summary',
            description: 'Cloud feed summary',
            updatedAt: '2024-02-05',
          },
          episodes: [],
        })
      )
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_FEED_ENDPOINTS.feed(feedUrl),
      ].sort()
    )
    assert.ok(session.container.textContent?.includes('Cloud Feed'))
    assert.ok(session.container.textContent?.includes('No feed episodes are available yet.'))
  } finally {
    await session.restore()
  }
})

test('App feed renders error state when feed upstream fails', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const feed = createDeferred<Response>()
  const requested: string[] = []
  const feedUrl = 'https://feeds.example.com/feed.xml'

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_FEED_ENDPOINTS.feed(feedUrl)) return feed.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(jsonResponse({ results: [] }))
      episodes.resolve(jsonResponse({ results: [] }))
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Feed')
      await flush()
    })

    const input = findInput(session.container, 'Feed URL')

    await act(async () => {
      setInputValue(input, feedUrl)
      clickButtonInSection(session.container, 'Feed parsing', 'Load feed')
      await flush()
    })

    await act(async () => {
      feed.resolve(
        jsonResponse(
          {
            error: 'upstream failed',
          },
          502
        )
      )
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_FEED_ENDPOINTS.feed(feedUrl),
      ].sort()
    )
    assert.ok(session.container.textContent?.includes('Request failed with status 502'))
  } finally {
    await session.restore()
  }
})

test('App search flow calls same-origin search endpoints and can enter detail flow', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const searchPodcasts = createDeferred<Response>()
  const searchEpisodes = createDeferred<Response>()
  const detailPodcast = createDeferred<Response>()
  const detailEpisodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_SEARCH_ENDPOINTS.podcasts('cloud search')) return searchPodcasts.promise
    if (url === DISCOVERY_SEARCH_ENDPOINTS.episodes('cloud search')) return searchEpisodes.promise
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcast('101')) return detailPodcast.promise
    if (url === DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101')) return detailEpisodes.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(
        jsonResponse({
          results: [
            {
              id: '201',
              name: 'Cloud Top Episodes',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id201',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    const input = findInput(session.container, 'Search term')

    await act(async () => {
      setInputValue(input, 'cloud search')
      session.container.querySelector('form')?.dispatchEvent(
        new Event('submit', {
          bubbles: true,
          cancelable: true,
        })
      )
      await flush()
    })

    assert.ok(session.container.textContent?.includes('Searching for cloud search...'))

    await act(async () => {
      searchPodcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Search Podcast',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      searchEpisodes.resolve(
        jsonResponse({
          results: [
            {
              id: '301',
              name: 'Cloud Search Episode',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id301',
              providerEpisodeId: '301',
            },
          ],
        })
      )
      await flush()
    })

    assert.ok(session.container.textContent?.includes('Podcast results for cloud search'))
    assert.ok(session.container.textContent?.includes('Episode results for cloud search'))
    assert.ok(session.container.textContent?.includes('Cloud Search Podcast'))
    assert.ok(session.container.textContent?.includes('Cloud Search Episode'))

    await act(async () => {
      clickButtonInSection(session.container, 'Podcast results for cloud search', 'Open search detail')
      await flush()
    })

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (
        requested.includes(DISCOVERY_LOOKUP_ENDPOINTS.podcast('101')) &&
        requested.includes(DISCOVERY_LOOKUP_ENDPOINTS.podcastEpisodes('101'))
      ) {
        break
      }

      await act(async () => {
        await flush()
      })
    }

    await act(async () => {
      detailPodcast.resolve(
        jsonResponse({
          country: 'us',
          podcast: {
            id: '101',
            name: 'Cloud Podcast Detail',
            artistName: 'Readio',
            artworkUrl100: 'https://example.com/podcast.jpg',
            description: 'Podcast summary',
            releaseDate: '2024-02-03',
            providerPodcastId: '101',
          },
        })
      )
      detailEpisodes.resolve(
        jsonResponse({
          country: 'us',
          limit: 100,
          podcast: {
            id: '101',
            name: 'Cloud Podcast Detail',
            artistName: 'Readio',
            artworkUrl100: 'https://example.com/podcast.jpg',
            description: 'Podcast summary',
            releaseDate: '2024-02-03',
            providerPodcastId: '101',
          },
          results: [
            {
              id: '201',
              name: 'Episode One',
              artistName: 'Readio',
              artworkUrl100: 'https://example.com/episode-1.jpg',
              description: 'Episode one summary',
              releaseDate: '2024-02-04',
              providerPodcastId: '101',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    const html = session.container.innerHTML
    assert.ok(html.includes('Cloud Podcast Detail'))
    assert.ok(html.includes('Episode One'))
    assert.ok(!html.includes('href='))
    assert.ok(!html.includes('podcasts.apple.com'))
    assert.ok(!html.includes('itunes.apple.com'))
    assert.equal(session.container.querySelector('a[href*="apple.com"]'), null)
  } finally {
    await session.restore()
  }
})

test('App search renders empty state when both search endpoints return empty results', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const searchPodcasts = createDeferred<Response>()
  const searchEpisodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_SEARCH_ENDPOINTS.podcasts('cloud search')) return searchPodcasts.promise
    if (url === DISCOVERY_SEARCH_ENDPOINTS.episodes('cloud search')) return searchEpisodes.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(
        jsonResponse({
          results: [
            {
              id: '201',
              name: 'Cloud Top Episodes',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id201',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    const input = findInput(session.container, 'Search term')

    await act(async () => {
      setInputValue(input, 'cloud search')
      session.container.querySelector('form')?.dispatchEvent(
        new Event('submit', {
          bubbles: true,
          cancelable: true,
        })
      )
      await flush()
    })

    await act(async () => {
      searchPodcasts.resolve(jsonResponse({ results: [] }))
      searchEpisodes.resolve(jsonResponse({ results: [] }))
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_SEARCH_ENDPOINTS.podcasts('cloud search'),
        DISCOVERY_SEARCH_ENDPOINTS.episodes('cloud search'),
      ].sort()
    )
    assert.ok(session.container.textContent?.includes('No search results were found for cloud search.'))
  } finally {
    await session.restore()
  }
})

test('App search renders error state when a search upstream call fails', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const searchPodcasts = createDeferred<Response>()
  const searchEpisodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise
    if (url === DISCOVERY_SEARCH_ENDPOINTS.podcasts('cloud search')) return searchPodcasts.promise
    if (url === DISCOVERY_SEARCH_ENDPOINTS.episodes('cloud search')) return searchEpisodes.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(
        jsonResponse({
          results: [
            {
              id: '201',
              name: 'Cloud Top Episodes',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id201',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    const input = findInput(session.container, 'Search term')

    await act(async () => {
      setInputValue(input, 'cloud search')
      session.container.querySelector('form')?.dispatchEvent(
        new Event('submit', {
          bubbles: true,
          cancelable: true,
        })
      )
      await flush()
    })

    await act(async () => {
      searchPodcasts.resolve(
        jsonResponse(
          {
            error: 'upstream failed',
          },
          502
        )
      )
      searchEpisodes.resolve(jsonResponse({ results: [] }))
      await flush()
    })

    assert.deepEqual(
      requested.slice().sort(),
      [
        DISCOVERY_ENDPOINTS.topEpisodes,
        DISCOVERY_ENDPOINTS.topPodcasts,
        DISCOVERY_SEARCH_ENDPOINTS.podcasts('cloud search'),
        DISCOVERY_SEARCH_ENDPOINTS.episodes('cloud search'),
      ].sort()
    )
    assert.ok(session.container.textContent?.includes('Request failed with status 502'))
  } finally {
    await session.restore()
  }
})

test('App search empty term renders validation error and does not fall back to top charts', async () => {
  const podcasts = createDeferred<Response>()
  const episodes = createDeferred<Response>()
  const requested: string[] = []

  const fetchMock = async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)

    if (url === DISCOVERY_ENDPOINTS.topPodcasts) return podcasts.promise
    if (url === DISCOVERY_ENDPOINTS.topEpisodes) return episodes.promise

    throw new Error(`Unexpected URL: ${url}`)
  }

  const session = await renderApp(fetchMock)
  try {
    await act(async () => {
      podcasts.resolve(
        jsonResponse({
          results: [
            {
              id: '101',
              name: 'Cloud Top Podcasts',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id101',
              providerPodcastId: '101',
            },
          ],
        })
      )
      episodes.resolve(
        jsonResponse({
          results: [
            {
              id: '201',
              name: 'Cloud Top Episodes',
              artistName: 'Readio',
              url: 'https://podcasts.apple.com/us/podcast/example/id201',
              providerEpisodeId: '201',
            },
          ],
        })
      )
      await flush()
    })

    await act(async () => {
      clickNav(session.container, 'Search')
      await flush()
    })

    const input = findInput(session.container, 'Search term')

    await act(async () => {
      setInputValue(input, '   ')
      session.container.querySelector('form')?.dispatchEvent(
        new Event('submit', {
          bubbles: true,
          cancelable: true,
        })
      )
      await flush()
    })

    assert.ok(session.container.textContent?.includes('Search term is required'))
    assert.deepEqual(
      requested.slice().sort(),
      [DISCOVERY_ENDPOINTS.topEpisodes, DISCOVERY_ENDPOINTS.topPodcasts].sort()
    )
  } finally {
    await session.restore()
  }
})

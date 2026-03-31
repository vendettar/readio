import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../__tests__/setup'
import { usePodcastSearch } from '../usePodcastSearch'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('usePodcastSearch', () => {
  beforeEach(() => {
    server.use(
      http.get('https://itunes.apple.com/search', () => {
        throw new Error('usePodcastSearch should not call Apple search directly in Cloud')
      })
    )
  })

  it('returns podcast results successfully', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/search/podcasts', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('term')).toBe('test')
        expect(url.searchParams.get('country')).toBe('us')
        expect(url.searchParams.get('limit')).toBe('20')

        return HttpResponse.json([
          {
            providerPodcastId: 123456789,
            collectionName: 'Test Podcast',
            artistName: 'Test Artist',
            artworkUrl100: 'https://example.com/art100.jpg',
            artworkUrl600: 'https://example.com/art600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            genres: ['Technology'],
            trackCount: 10,
            collectionViewUrl: 'https://podcasts.apple.com/test',
          },
        ])
      })
    )

    const { result } = renderHook(() => usePodcastSearch('test', 'us'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].collectionName).toBe('Test Podcast')
  })

  it('handles empty results', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/search/podcasts', () =>
        HttpResponse.json([])
      )
    )

    const { result } = renderHook(() => usePodcastSearch('empty', 'us'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(0)
  })

  it('handles errors', async () => {
    // Suppress console.error for this test as we expect an error to be logged
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/search/podcasts', () =>
        HttpResponse.json(
          { error: 'upstream_invalid_response', message: 'bad gateway' },
          { status: 502 }
        )
      )
    )

    const { result } = renderHook(() => usePodcastSearch('error', 'us'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    consoleSpy.mockRestore()
  })

  it('reports loading before the same-origin request resolves', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/search/podcasts', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json([
          {
            providerPodcastId: 123,
            collectionName: 'Delayed Podcast',
            collectionViewUrl: 'https://podcasts.apple.com/delayed',
          },
        ])
      })
    )

    const { result } = renderHook(() => usePodcastSearch('delay', 'us'), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

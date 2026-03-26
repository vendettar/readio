import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  it('returns podcast results successfully', async () => {
    const { result } = renderHook(() => usePodcastSearch('test', 'us'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].collectionName).toBe('Test Podcast')
  })

  it('handles empty results', async () => {
    const { result } = renderHook(() => usePodcastSearch('empty', 'us'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(0)
  })

  it('handles errors', async () => {
    // Suppress console.error for this test as we expect an error to be logged
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => usePodcastSearch('error', 'us'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    consoleSpy.mockRestore()
  })
})

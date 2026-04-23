import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

type QueryClientOptions = {
  setup?: (queryClient: QueryClient) => void
}

export function createTestQueryClient(options: QueryClientOptions = {}): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  options.setup?.(queryClient)

  return queryClient
}

export function createQueryClientWrapper(options: QueryClientOptions = {}) {
  const queryClient = createTestQueryClient(options)

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

export function createQueryClientHarness(options: QueryClientOptions = {}) {
  const queryClient = createTestQueryClient(options)

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return { queryClient, wrapper }
}

export function withQueryClient(node: ReactNode, options: QueryClientOptions = {}) {
  const queryClient = createTestQueryClient(options)
  return <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
}

export function renderWithQueryClient(node: ReactNode, options: QueryClientOptions = {}) {
  const harness = createQueryClientHarness(options)
  return {
    ...render(node, { wrapper: harness.wrapper }),
    queryClient: harness.queryClient,
  }
}

export function renderHookWithQueryClient<Result, Props>(
  renderCallback: (initialProps: Props) => Result,
  options?: {
    initialProps: Props
    queryClient?: QueryClientOptions
  }
) {
  const harness = createQueryClientHarness(options?.queryClient)
  return {
    ...renderHook(renderCallback, {
      initialProps: options?.initialProps,
      wrapper: harness.wrapper,
    }),
    queryClient: harness.queryClient,
  }
}

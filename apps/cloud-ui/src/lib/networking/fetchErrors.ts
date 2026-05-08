export type FetchSource = 'direct' | 'customProxy' | 'cloudBackend'

export class NetworkError extends Error {
  constructor(message = 'No internet connection') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class FetchError extends Error {
  status?: number
  url: string
  source: FetchSource
  code?: string
  requestId?: string

  constructor(
    message: string,
    url: string,
    status: number | undefined,
    source: FetchSource,
    options?: {
      code?: string
      requestId?: string
    }
  ) {
    super(message)
    this.name = 'FetchError'
    this.url = url
    this.status = status
    this.source = source
    this.code = options?.code
    this.requestId = options?.requestId
  }
}

export function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (!!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
  )
}

export function parseFetchedResponse<T>(
  response: Response,
  options: { raw: boolean; json: boolean }
): Promise<T> | T {
  if (options.raw) return response as unknown as T
  if (options.json) return response.json() as Promise<T>
  return response.text() as Promise<T>
}

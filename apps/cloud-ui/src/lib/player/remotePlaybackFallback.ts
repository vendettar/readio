const BOOTSTRAP_TIMEOUT_MS = 10000

const PROXY_PATH = '/api/proxy'

const MAX_BREAKER_HOSTS = 50
const BREAKER_THRESHOLD = 3

function buildProxyPlaybackUrl(remoteUrl: string): string {
  return `${PROXY_PATH}?url=${encodeURIComponent(remoteUrl)}`
}

function isEligibleForBootstrapFallback(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url) return false
  const lower = url.toLowerCase()
  if (lower.startsWith('blob:')) return false
  if (lower.startsWith('file:')) return false
  if (lower.startsWith('data:')) return false
  if (!/^https?:\/\//i.test(url)) return false
  if (url.includes(PROXY_PATH)) return false
  return true
}

function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

type BreakerEntry = { count: number }

class RemoteFallbackBreaker {
  private map = new Map<string, BreakerEntry>()
  private order: string[] = []

  recordFailure(host: string): void {
    if (!host) return
    const existing = this.map.get(host)
    if (existing) {
      existing.count++
      return
    }
    if (this.map.size >= MAX_BREAKER_HOSTS) {
      const oldest = this.order.shift()
      if (oldest) this.map.delete(oldest)
    }
    this.map.set(host, { count: 1 })
    this.order.push(host)
  }

  recordSuccess(host: string): void {
    if (!host) return
    const existing = this.map.get(host)
    if (existing && existing.count > 0) {
      // Fast recovery: decrement failure count on success
      existing.count--
      if (existing.count === 0) {
        this.map.delete(host)
        this.order = this.order.filter((h) => h !== host)
      }
    }
  }

  shouldProxyFirst(host: string): boolean {
    return (this.map.get(host)?.count ?? 0) >= BREAKER_THRESHOLD
  }

  reset(): void {
    this.map.clear()
    this.order.length = 0
  }
}

const remoteFallbackBreaker = new RemoteFallbackBreaker()

export {
  BOOTSTRAP_TIMEOUT_MS,
  BREAKER_THRESHOLD,
  buildProxyPlaybackUrl,
  extractHost,
  isEligibleForBootstrapFallback,
  remoteFallbackBreaker,
}

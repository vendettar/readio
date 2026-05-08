import { log } from '../logger'

export interface ProxyAuthConfig {
  authHeader: string
  authValue: string
}

export function buildProxyAuthHeaders({
  authHeader,
  authValue,
}: ProxyAuthConfig): Record<string, string> {
  if (!authValue) return {}
  if (!authHeader) {
    if (import.meta.env.DEV) {
      log('[fetchUtils] Skipping proxy auth header because authHeader is empty.')
    }
    return {}
  }

  try {
    const validationHeaders = new Headers()
    validationHeaders.set(authHeader, authValue)
    return { [authHeader]: authValue }
  } catch {
    if (import.meta.env.DEV) {
      log(`[fetchUtils] Skipping invalid proxy auth header name: "${authHeader}".`)
    }
    return {}
  }
}

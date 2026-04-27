import { getAppConfig } from '../runtimeConfig'

function normalizeCustomProxyUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

export function getNetworkProxyConfig(): {
  proxyUrl: string
  authHeader: string
  authValue: string
} {
  const config = getAppConfig()

  const proxyUrl = normalizeCustomProxyUrl(config.NETWORK_PROXY_URL || '')
  const authHeader = String(config.NETWORK_PROXY_AUTH_HEADER || '').trim()
  const authValue = String(config.NETWORK_PROXY_AUTH_VALUE || '').trim()

  return {
    proxyUrl,
    authHeader,
    authValue,
  }
}

export function buildProxyUrl(proxyBase: string, targetUrl: string): string {
  const base = String(proxyBase || '').trim()
  const encoded = encodeURIComponent(String(targetUrl || ''))

  if (!base) throw new Error('Missing proxy base URL')
  if (base.includes('{url}')) return base.split('{url}').join(encoded)
  if (/([?&])url=$/i.test(base)) return `${base}${encoded}`
  if (base.includes('?')) return `${base}&url=${encoded}`
  return `${base}?url=${encoded}`
}

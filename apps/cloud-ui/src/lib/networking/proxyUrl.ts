import { SETTINGS_STORAGE_KEY } from '../../constants/storage'
import { getAppConfig } from '../runtimeConfig'
import type { SettingsPreferenceValues } from '../schemas/settings'
import { getJson } from '../storage'

function normalizeCustomProxyUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

export function getCorsProxyConfig(): { proxyUrl: string; authHeader: string; authValue: string } {
  const config = getAppConfig()
  const userSettings = getJson<SettingsPreferenceValues>(SETTINGS_STORAGE_KEY)

  const rawUrl = userSettings?.proxyUrl || config.CORS_PROXY_URL || ''
  const proxyUrl = normalizeCustomProxyUrl(rawUrl)
  const authHeader = String(
    userSettings?.proxyAuthHeader || config.CORS_PROXY_AUTH_HEADER || ''
  ).trim()
  const authValue = String(
    userSettings?.proxyAuthValue || config.CORS_PROXY_AUTH_VALUE || ''
  ).trim()

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

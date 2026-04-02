import { ASR_PROVIDER_IDS, type ASRProvider } from './types'

type ProviderToggleConfigLike = {
  ENABLED_ASR_PROVIDERS?: string | null
  DISABLED_ASR_PROVIDERS?: string | null
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase()
}

function parseProviderTokens(value: string | null | undefined): string[] {
  if (!value) return []
  const deduped = new Set<string>()
  for (const rawToken of value.split(',')) {
    const token = normalizeToken(rawToken)
    if (!token) continue
    deduped.add(token)
  }
  return Array.from(deduped)
}

function isEnableAllToken(value: string | null | undefined): boolean {
  const normalized = normalizeToken(value ?? '')
  return normalized === '' || normalized === '*' || normalized === 'all'
}

export const defaultAsrProvider = 'groq' as const

export function resolveEnabledAsrProviders(configLike: ProviderToggleConfigLike): ASRProvider[] {
  const enabledRaw = configLike.ENABLED_ASR_PROVIDERS
  const disabledRaw = configLike.DISABLED_ASR_PROVIDERS

  const baseSet = new Set<ASRProvider>()
  if (isEnableAllToken(enabledRaw)) {
    for (const provider of ASR_PROVIDER_IDS) {
      baseSet.add(provider)
    }
  } else {
    for (const token of parseProviderTokens(enabledRaw)) {
      if (ASR_PROVIDER_IDS.includes(token as ASRProvider)) {
        baseSet.add(token as ASRProvider)
      }
    }
  }

  for (const token of parseProviderTokens(disabledRaw)) {
    if (ASR_PROVIDER_IDS.includes(token as ASRProvider)) {
      baseSet.delete(token as ASRProvider)
    }
  }

  const resolved = ASR_PROVIDER_IDS.filter((provider) => baseSet.has(provider))
  // TODO: Temporarily block providers except Groq until they are fully stabilized.
  return resolved.filter((p) => p === 'groq')
}

export function isAsrProviderEnabled(
  provider: ASRProvider,
  configLike: ProviderToggleConfigLike
): boolean {
  return resolveEnabledAsrProviders(configLike).includes(provider)
}

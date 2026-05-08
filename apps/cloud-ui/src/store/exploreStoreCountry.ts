import { normalizeCountryCode } from '../constants/app'
import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'
import { SettingsRepository } from '../lib/repositories/SettingsRepository'
import { getAppConfig } from '../lib/runtimeConfig'

const SETTING_KEY_COUNTRY = 'explore_country'

let hasHydratedCountry = false
let hasManualCountrySelection = false
let countryHydrationPromise: Promise<void> | null = null

type ExploreCountryState = {
  country: string
}

type ExploreCountryStoreAccess = {
  getState: () => ExploreCountryState
  setState: (partial: Partial<ExploreCountryState>) => void
}

export function getInitialExploreCountry(): string {
  return getAppConfig().DEFAULT_COUNTRY
}

export async function hydrateExploreCountry(store: ExploreCountryStoreAccess): Promise<void> {
  if (hasHydratedCountry) return
  if (countryHydrationPromise) {
    return countryHydrationPromise
  }

  countryHydrationPromise = (async () => {
    try {
      const country = await SettingsRepository.getSetting(SETTING_KEY_COUNTRY)
      hasHydratedCountry = true
      if (!country || hasManualCountrySelection) return

      const normalizedCountry = normalizeCountryCode(country)
      if (store.getState().country === normalizedCountry) return

      store.setState({ country: normalizedCountry })
    } catch (err) {
      if (!isAbortLikeError(err)) warn('[ExploreStore] Failed to hydrate country setting:', err)
    } finally {
      countryHydrationPromise = null
    }
  })()

  return countryHydrationPromise
}

export function persistExploreCountrySelection(
  store: ExploreCountryStoreAccess,
  country: string
): void {
  const normalizedCountry = normalizeCountryCode(country)
  hasManualCountrySelection = true

  if (store.getState().country !== normalizedCountry) {
    store.setState({ country: normalizedCountry })
  }
  void SettingsRepository.setSetting(SETTING_KEY_COUNTRY, normalizedCountry).catch((err) => {
    if (!isAbortLikeError(err)) warn('[ExploreStore] Failed to save setting:', err)
  })
}

export function __testOnlyResetExploreCountryState(): void {
  hasHydratedCountry = false
  hasManualCountrySelection = false
  countryHydrationPromise = null
}

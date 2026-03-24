import { getAsrCredentialKey, getCredential } from '../db/credentialsRepository'
import { sha256 } from '../networking/urlUtils'
import { getSettingsSnapshot } from '../schemas/settings'
import { getJson, removeItem, setJson } from '../storage'
import { type AsrConfigErrorCode, validateAsrProviderModelSelection } from './registry'
import type { ASRProvider } from './types'

const ASR_VERIFICATION_STORAGE_KEY = 'readio:asr-verification'
const ASR_READINESS_UPDATED_EVENT = 'readio:asr-readiness-updated'

interface AsrVerificationRecord {
  provider: ASRProvider
  model: string
  keyHash: string
  verifiedAt: number
}

function emitAsrReadinessUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ASR_READINESS_UPDATED_EVENT))
}

export function getAsrReadinessUpdatedEventName(): string {
  return ASR_READINESS_UPDATED_EVENT
}

export async function markAsrVerificationSucceeded(input: {
  provider: ASRProvider
  model: string
  apiKey: string
}): Promise<void> {
  const provider = input.provider
  const model = input.model.trim()
  const apiKey = input.apiKey.trim()
  if (!provider || !model || !apiKey) return

  const keyHash = await sha256(apiKey)
  setJson(ASR_VERIFICATION_STORAGE_KEY, {
    provider,
    model,
    keyHash,
    verifiedAt: Date.now(),
  } satisfies AsrVerificationRecord)
  emitAsrReadinessUpdated()
}

export function clearAsrVerification(): void {
  removeItem(ASR_VERIFICATION_STORAGE_KEY)
  emitAsrReadinessUpdated()
}

interface AsrReadinessResult {
  ready: boolean
  reasonCode?: AsrConfigErrorCode | 'missing_key' | 'not_verified'
}

export async function getAsrReadiness(): Promise<AsrReadinessResult> {
  const settings = getSettingsSnapshot()
  const selection = validateAsrProviderModelSelection({
    asrProvider: settings.asrProvider,
    asrModel: settings.asrModel,
    asrUseCustomModel: settings.asrUseCustomModel,
    asrCustomModelId: settings.asrCustomModelId,
  })
  if (!selection.ok) {
    return { ready: false, reasonCode: selection.code }
  }

  const apiKey = (await getCredential(getAsrCredentialKey(selection.provider))).trim()
  if (!apiKey) {
    return { ready: false, reasonCode: 'missing_key' }
  }

  const verification = getJson<AsrVerificationRecord>(ASR_VERIFICATION_STORAGE_KEY)
  if (!verification) {
    return { ready: false, reasonCode: 'not_verified' }
  }
  if (verification.provider !== selection.provider || verification.model !== selection.model) {
    return { ready: false, reasonCode: 'not_verified' }
  }

  const expectedHash = await sha256(apiKey)
  if (verification.keyHash !== expectedHash) {
    return { ready: false, reasonCode: 'not_verified' }
  }

  return { ready: true }
}

export async function isAsrReadyForGeneration(): Promise<boolean> {
  const readiness = await getAsrReadiness()
  return readiness.ready
}

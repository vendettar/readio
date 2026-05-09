import {
  ASR_CREDENTIAL_KEY,
  clearAllCredentials,
  getAllCredentials,
  getAsrCredentialKey as getAsrCredentialKeyInternal,
  getCredential,
  getCredentialWriteEpoch,
  setCredentials,
  TRANSLATE_CREDENTIAL_KEY,
} from '../db/credentialsRepository'

export function getWriteEpoch(): number {
  return getCredentialWriteEpoch()
}

export function getAll(): Promise<Record<string, string>> {
  return getAllCredentials()
}

export function get(key: string): Promise<string> {
  return getCredential(key)
}

export function getAsrCredentialKey(provider: string): string {
  return getAsrCredentialKeyInternal(provider)
}

export function setMany(entries: Record<string, string>, expectedEpoch?: number): Promise<void> {
  return setCredentials(entries, expectedEpoch)
}

export function clearAll(): Promise<void> {
  return clearAllCredentials()
}

export const CredentialsRepository = {
  ASR_CREDENTIAL_KEY,
  TRANSLATE_CREDENTIAL_KEY,
  getWriteEpoch,
  getAll,
  get,
  getAsrCredentialKey,
  setMany,
  clearAll,
}

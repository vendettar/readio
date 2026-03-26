/**
 * Safe storage helpers for localStorage and sessionStorage
 * Never throws - returns null on parse errors
 */

import { warn } from './logger'

function sanitizeStorageKeyForLogging(key: string | undefined): string | undefined {
  if (!key) return key
  const shouldRedact = /(credential|openai|groq|api[_-]?key|provider_[a-z0-9_]+_key)/i.test(key)
  return shouldRedact ? '[redacted]' : key
}

function devWarnStorageFailure(
  operation: 'setJson' | 'removeItem' | 'clearStorage' | 'clearNamespace' | 'parseError',
  context: { key?: string; prefix?: string },
  error: unknown
): void {
  if (!import.meta.env.DEV) return
  const message = error instanceof Error ? error.message : String(error)
  warn('[storage] operation_failed', {
    operation,
    ...context,
    key: sanitizeStorageKeyForLogging(context.key),
    error: message,
  })
}

// Throttling for parse error diagnostics to avoid log flood
const lastParseErrorTimes = new Map<string, number>()
const PARSE_ERROR_THROTTLE_MS = 60000

// ============ Key Helpers ============

/**
 * Build a namespaced storage key
 * @param namespace Namespace prefix
 * @param key Key within namespace
 * @returns Namespaced key string
 */
export function nsKey(namespace: string, key: string): string {
  return `${namespace}:${key}`
}

// ============ Basic JSON Helpers ============

/**
 * Safely get and parse JSON from storage
 * @param key Storage key
 * @param storage Storage instance (localStorage or sessionStorage)
 * @returns Parsed value or null if not found or parse error
 */
export function getJson<T = unknown>(key: string, storage: Storage = localStorage): T | null {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch (error) {
    const now = Date.now()
    const lastError = lastParseErrorTimes.get(key) || 0
    if (now - lastError > PARSE_ERROR_THROTTLE_MS) {
      devWarnStorageFailure('parseError', { key }, error)
      lastParseErrorTimes.set(key, now)
    }
    return null
  }
}

/**
 * Safely stringify and set JSON to storage
 * @param key Storage key
 * @param value Value to store
 * @param storage Storage instance (localStorage or sessionStorage)
 * @returns true if successful, false otherwise
 */
export function setJson(key: string, value: unknown, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(key, JSON.stringify(value))
    if (storage === localStorage) {
      window.dispatchEvent(new CustomEvent('readio-settings-updated', { detail: { key } }))
    }
    return true
  } catch (error) {
    devWarnStorageFailure('setJson', { key }, error)
    return false
  }
}

// ============ TTL Helpers ============

export interface StoredWithTimestamp<T> {
  data: T
  at: number
}

/**
 * Get JSON from storage with TTL check
 * @param key Storage key
 * @param ttlMs Time-to-live in milliseconds
 * @param storage Storage instance
 * @returns Parsed value if within TTL, null otherwise
 */
export function getJsonWithTtl<T = unknown>(
  key: string,
  ttlMs: number,
  storage: Storage = localStorage
): T | null {
  const stored = getJson<StoredWithTimestamp<T>>(key, storage)
  if (!stored || typeof stored.at !== 'number') return null
  if (Date.now() - stored.at > ttlMs) return null
  return stored.data
}

/**
 * Set JSON to storage with timestamp for TTL
 * @param key Storage key
 * @param value Value to store
 * @param storage Storage instance
 * @returns true if successful, false otherwise
 */
export function setJsonWithTtl<T = unknown>(
  key: string,
  value: T,
  storage: Storage = localStorage
): boolean {
  return setJson(key, { data: value, at: Date.now() }, storage)
}

// ============ Cleanup Helpers ============

/**
 * Remove item from storage
 * @param key Storage key
 * @param storage Storage instance (localStorage or sessionStorage)
 */
export function removeItem(key: string, storage: Storage = localStorage): void {
  try {
    storage.removeItem(key)
  } catch (error) {
    devWarnStorageFailure('removeItem', { key }, error)
  }
}

/**
 * Clear all items from storage
 * @param storage Storage instance (localStorage or sessionStorage)
 */
export function clearStorage(storage: Storage = localStorage): void {
  try {
    storage.clear()
  } catch (error) {
    devWarnStorageFailure('clearStorage', {}, error)
  }
}

/**
 * Clear all items with a given key prefix (namespace)
 * @param prefix Key prefix to match
 * @param storage Storage instance
 */
export function clearNamespace(prefix: string, storage: Storage = localStorage): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => {
      storage.removeItem(key)
    })
  } catch (error) {
    devWarnStorageFailure('clearNamespace', { prefix }, error)
  }
}

// src/hooks/selection/useSelectionActions.ts
// User actions for text selection (copy, search, lookup)
import { useCallback, useEffect, useRef } from 'react'
import { DEFAULT_SEARCH_ENGINE } from '../../constants/app'
import { warn } from '../../lib/logger'
import { openExternal } from '../../lib/openExternal'
import { getSettingsSnapshot } from '../../lib/schemas/settings'
import type { SelectionAnchorRect, SelectionOwner, SelectionState } from '../../lib/selection'
import { fetchDefinition, isLookupEligible } from '../../lib/selection'
import { applyLookupHighlightForWord } from '../../lib/selection/dictCache'
import { normalizeInteractiveWord } from '../../lib/text'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'

/**
 * Interaction refinement constants
 */
const INTERACTION_PAUSE_DELAY_MS = 0 // Tick offset to ensure pause wins over native click triggers
const CONFIGURED_DICTIONARY_LANGUAGES = new Set(['en'])

function normalizeLookupLanguage(owner: SelectionOwner): string | null {
  const lookupLanguage = (owner as SelectionOwner & { lookupLanguage?: string }).lookupLanguage
  if (!lookupLanguage) return null
  const normalized = lookupLanguage.trim().toLowerCase()
  if (!normalized) return null
  return normalized.split('-')[0] ?? null
}

function resolveDictionaryAvailability(owner: SelectionOwner): {
  normalizedLanguage: string | null
  isConfigured: boolean
} {
  const normalizedLanguage = normalizeLookupLanguage(owner)
  return {
    normalizedLanguage,
    isConfigured:
      normalizedLanguage !== null && CONFIGURED_DICTIONARY_LANGUAGES.has(normalizedLanguage),
  }
}

function hasDefinitionResult(result: SelectionState['lookupResult']): boolean {
  if (!result) return false
  return result.meanings.some((meaning) =>
    meaning.definitions.some((definition) => definition.definition.trim().length > 0)
  )
}

function toSelectionAnchorRect(rect: SelectionAnchorRect | DOMRect): SelectionAnchorRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

export function useSelectionActions(
  state: SelectionState,
  setState: React.Dispatch<React.SetStateAction<SelectionState>>
) {
  const abortRef = useRef<AbortController | null>(null)

  // Generation counter to prevent stale pause calls from winning after a cancel
  const interactionSequenceRef = useRef(0)
  const lookupSequenceRef = useRef(0)
  const surfaceInstanceCounterRef = useRef(0)
  const pendingLookupHighlightWordRef = useRef<string | null>(null)

  const wasPlayingBeforeInteractionRef = useRef(false)

  // Sync state to refs for safe access in side-effects/callbacks without stale closures
  const activeSurfaceIdRef = useRef<number | undefined>(
    state.surface.type !== 'none' ? state.surface.surfaceId : undefined
  )
  const activeSurfaceTypeRef = useRef(state.surface.type)

  useEffect(() => {
    activeSurfaceTypeRef.current = state.surface.type
    activeSurfaceIdRef.current = state.surface.type !== 'none' ? state.surface.surfaceId : undefined
  }, [state.surface])

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
  }, [])

  const prepareInteraction = useCallback(() => {
    const isPlaying = usePlayerStore.getState().isPlaying
    if (isPlaying) {
      wasPlayingBeforeInteractionRef.current = true

      // Captured sequence to validate on execution
      const expectedSequence = interactionSequenceRef.current

      // Using a micro-task delay to ensure pause occurs AFTER any synchronous
      // event handlers (like native click-to-seek) that might start playback.
      setTimeout(() => {
        // If the sequence moved, this interaction session was canceled or replaced
        if (expectedSequence !== interactionSequenceRef.current) {
          return
        }
        usePlayerStore.getState().pause()
      }, INTERACTION_PAUSE_DELAY_MS)
    }
  }, [])

  const cancelInteraction = useCallback((options?: { reason?: 'dismiss' | 'switch' }) => {
    // Invalidate any pending pause calls by advancing the sequence
    interactionSequenceRef.current += 1

    const shouldResume = options?.reason !== 'switch'
    if (wasPlayingBeforeInteractionRef.current && shouldResume) {
      usePlayerStore.getState().play()
      wasPlayingBeforeInteractionRef.current = false
    }
  }, [])

  const clearSurface = useCallback(
    (options?: { reason?: 'dismiss' | 'switch' }) => {
      activeSurfaceIdRef.current = undefined
      pendingLookupHighlightWordRef.current = null
      setState({
        surface: { type: 'none' },
        lookupLoading: false,
        lookupErrorKey: null,
        lookupResult: null,
      })

      // Side effects belong in the callback, OUTSIDE the render/state update chain
      useTranscriptStore.getState().setHighlightedWord(null)
      window.getSelection()?.removeAllRanges()

      cancelInteraction(options)
    },
    [setState, cancelInteraction]
  )

  const copyText = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).catch((err) => {
        warn('[Selection] Clipboard write failed', err)
      })
      clearSurface()
    },
    [clearSurface]
  )

  const searchWeb = useCallback(
    (text: string) => {
      const url = `${DEFAULT_SEARCH_ENGINE}${encodeURIComponent(text)}`
      openExternal(url)
      clearSurface()
    },
    [clearSurface]
  )

  const openWordMenu = useCallback(
    (
      word: string,
      x: number,
      y: number,
      rect: SelectionAnchorRect | DOMRect,
      owner: SelectionOwner
    ) => {
      const normalizedWord = normalizeInteractiveWord(word)

      prepareInteraction()

      const newId = ++surfaceInstanceCounterRef.current
      activeSurfaceIdRef.current = newId

      setState((s) => ({
        ...s,
        surface: {
          type: 'contextMenu',
          surfaceId: newId,
          position: { x, y, rect: toSelectionAnchorRect(rect) },
          selectedText: normalizedWord,
          menuMode: 'word',
          owner,
        },
      }))
    },
    [setState, prepareInteraction]
  )

  const openRangeMenu = useCallback(
    (text: string, x: number, y: number, rect: SelectionAnchorRect, owner: SelectionOwner) => {
      prepareInteraction()
      const newId = ++surfaceInstanceCounterRef.current
      activeSurfaceIdRef.current = newId

      setState((s) => ({
        ...s,
        surface: {
          type: 'rangeActionMenu',
          surfaceId: newId,
          position: { x, y, rect },
          selectedText: text,
          owner,
        },
      }))
    },
    [setState, prepareInteraction]
  )

  const openLineMenu = useCallback(
    (
      text: string,
      x: number,
      y: number,
      rect: SelectionAnchorRect,
      owner: SelectionOwner,
      mode: 'word' | 'line' = 'line'
    ) => {
      prepareInteraction()
      const newId = ++surfaceInstanceCounterRef.current
      activeSurfaceIdRef.current = newId

      setState((s) => ({
        ...s,
        surface: {
          type: 'contextMenu',
          surfaceId: newId,
          position: { x, y, rect },
          selectedText: text,
          menuMode: mode,
          owner,
        },
      }))
    },
    [setState, prepareInteraction]
  )

  const lookupWord = useCallback(
    async (
      word: string,
      x: number,
      y: number,
      rect: SelectionAnchorRect | DOMRect,
      owner: SelectionOwner
    ) => {
      const normalizedWord = normalizeInteractiveWord(word)
      if (!isLookupEligible(normalizedWord)) return

      if (abortRef.current) {
        abortRef.current.abort()
      }
      abortRef.current = new AbortController()
      pendingLookupHighlightWordRef.current = null

      lookupSequenceRef.current += 1
      const currentSequence = lookupSequenceRef.current

      const newId = ++surfaceInstanceCounterRef.current
      activeSurfaceIdRef.current = newId

      setState((s) => ({
        ...s,
        surface: {
          type: 'lookup',
          surfaceId: newId,
          word: normalizedWord,
          position: { x, y, rect: toSelectionAnchorRect(rect) },
          owner,
        },
        lookupLoading: true,
        lookupErrorKey: null,
        lookupResult: null,
      }))

      const { pauseOnDictionaryLookup } = getSettingsSnapshot()
      if (pauseOnDictionaryLookup) {
        prepareInteraction()
      }

      const dictionaryAvailability = resolveDictionaryAvailability(owner)
      if (
        dictionaryAvailability.normalizedLanguage !== null &&
        !dictionaryAvailability.isConfigured
      ) {
        pendingLookupHighlightWordRef.current = null
        setState((s) => ({
          ...s,
          lookupLoading: false,
          lookupErrorKey: 'lookupDictionaryNotConfigured',
          lookupResult: null,
        }))
        return
      }

      try {
        const result = await fetchDefinition(normalizedWord, abortRef.current.signal)
        const shouldHighlightOnClose = hasDefinitionResult(result)

        if (currentSequence === lookupSequenceRef.current) {
          pendingLookupHighlightWordRef.current = shouldHighlightOnClose ? normalizedWord : null
          setState((s) => ({
            ...s,
            lookupLoading: false,
            lookupResult: result,
          }))
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return

        if (currentSequence === lookupSequenceRef.current) {
          pendingLookupHighlightWordRef.current = null
          const isNotFound = error instanceof Error && error.message === 'Word not found'
          setState((s) => ({
            ...s,
            lookupLoading: false,
            lookupErrorKey: isNotFound ? 'lookupNotFound' : 'errorNetwork',
          }))
        }
      }
    },
    [setState, prepareInteraction]
  )

  const closeMenu = useCallback(
    (options?: {
      reason?: 'dismiss' | 'switch'
      surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
      surfaceId?: number
    }) => {
      // If a specific surface session is requested, ensure it matches the current active one.
      // This prevents stale cleanup calls (e.g. from an unmounting menu) from killing a newer surface.
      if (options?.surfaceId && activeSurfaceIdRef.current !== options.surfaceId) {
        return
      }
      if (
        !options?.surfaceId &&
        options?.surface &&
        activeSurfaceTypeRef.current !== options.surface
      ) {
        return
      }

      activeSurfaceIdRef.current = undefined
      pendingLookupHighlightWordRef.current = null
      setState({
        surface: { type: 'none' },
        lookupLoading: false,
        lookupErrorKey: null,
        lookupResult: null,
      })

      // Keep side-effects outside of state updates to avoid React render-phase warnings
      useTranscriptStore.getState().setHighlightedWord(null)
      window.getSelection()?.removeAllRanges()

      cancelInteraction(options)
    },
    [setState, cancelInteraction]
  )

  const closeLookup = useCallback(
    (options?: {
      reason?: 'dismiss' | 'switch'
      surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
      surfaceId?: number
    }) => {
      if (options?.surfaceId && activeSurfaceIdRef.current !== options.surfaceId) {
        return
      }
      if (!options?.surfaceId && activeSurfaceTypeRef.current !== 'lookup') return

      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }

      const pendingLookupHighlightWord = pendingLookupHighlightWordRef.current
      if (pendingLookupHighlightWord) {
        applyLookupHighlightForWord(pendingLookupHighlightWord)
      }

      activeSurfaceIdRef.current = undefined
      pendingLookupHighlightWordRef.current = null
      setState({
        surface: { type: 'none' },
        lookupLoading: false,
        lookupErrorKey: null,
        lookupResult: null,
      })

      useTranscriptStore.getState().setHighlightedWord(null)
      window.getSelection()?.removeAllRanges()

      cancelInteraction(options)
    },
    [setState, cancelInteraction]
  )

  return {
    copyText,
    searchWeb,
    openWordMenu,
    openRangeMenu,
    openLineMenu,
    lookupWord,
    prepareInteraction,
    cancelInteraction,
    closeMenu,
    closeLookup,
  }
}

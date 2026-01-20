// src/hooks/selection/useSelectionActions.ts
// User actions for text selection (copy, search, lookup)
import { useCallback, useRef } from 'react'
import { warn } from '../../lib/logger'
import { openExternal } from '../../lib/openExternal'
import type { SelectionState } from '../../lib/selection'
import { fetchDefinition, isLookupEligible } from '../../lib/selection'

export function useSelectionActions(
  setState: React.Dispatch<React.SetStateAction<SelectionState>>
) {
  const abortRef = useRef<AbortController | null>(null)
  const sequenceRef = useRef(0) // Sequence counter to prevent old requests from overwriting new ones

  const copyText = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).catch((err) => {
        warn('[Selection] Clipboard write failed', err)
      })
      setState((s) => ({ ...s, showMenu: false, selectedText: '' }))
      window.getSelection()?.removeAllRanges()
    },
    [setState]
  )

  const searchWeb = useCallback(
    (text: string) => {
      const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`
      openExternal(url)
      setState((s) => ({ ...s, showMenu: false, selectedText: '' }))
      window.getSelection()?.removeAllRanges()
    },
    [setState]
  )

  const lookupWord = useCallback(
    async (word: string, x: number, y: number) => {
      if (!isLookupEligible(word)) return

      // Abort previous request
      if (abortRef.current) {
        abortRef.current.abort()
      }
      abortRef.current = new AbortController()

      // Increment sequence to track this request
      sequenceRef.current += 1
      const currentSequence = sequenceRef.current

      setState((s) => ({
        ...s,
        showMenu: false,
        showLookup: true,
        lookupPosition: { x, y },
        lookupWord: word,
        lookupLoading: true,
        lookupErrorKey: null,
        lookupResult: null,
      }))

      try {
        const result = await fetchDefinition(word, abortRef.current.signal)

        // Only update state if this is still the latest request
        if (currentSequence === sequenceRef.current) {
          setState((s) => ({
            ...s,
            lookupLoading: false,
            lookupResult: result,
          }))
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return

        // Only update error if this is still the latest request
        if (currentSequence === sequenceRef.current) {
          setState((s) => ({
            ...s,
            lookupLoading: false,
            lookupErrorKey: 'lookupNotFound',
          }))
        }
      }
    },
    [setState]
  )

  const closeMenu = useCallback(() => {
    setState((s) => ({ ...s, showMenu: false, selectedText: '' }))
    window.getSelection()?.removeAllRanges()
  }, [setState])

  const closeLookup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setState((s) => ({ ...s, showLookup: false, hoverWord: '', hoverRects: [] }))
  }, [setState])

  return {
    copyText,
    searchWeb,
    lookupWord,
    closeMenu,
    closeLookup,
  }
}

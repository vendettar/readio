// src/hooks/selection/useSelectionEvents.ts
// Event handlers for text selection (pointer events)
// Unified state-machine led interaction gating
import { useCallback, useEffect, useRef } from 'react'
import { SELECTION_THRESHOLD } from '../../constants/app'
import type { SelectionAnchorRect, SelectionOwner } from '../../lib/selection'
import { loadDictCache } from '../../lib/selection'
import { useEventListener } from '../useEventListener'

/**
 * Interaction refinement constants (Central semantic authority)
 */
const INTERACTION_CONFIG = {
  FILTERS: {
    MOUSE: { moveThreshold: SELECTION_THRESHOLD, longPressMs: 0 }, // 0 means disabled
    TOUCH: { moveThreshold: SELECTION_THRESHOLD, longPressMs: 300 },
  },
} as const

type InteractionState = 'idle' | 'pressing' | 'selecting'

function normalizeMouseTarget(target: EventTarget | null): Element | null {
  if (target instanceof Text) {
    return target.parentElement
  }
  if (target instanceof Element) {
    return target
  }
  return null
}

function extractOwnerMetadata(el: Element): SelectionOwner | null {
  const ownerEl = el.closest('[data-owner-cue-key]')
  if (!ownerEl) return null

  const cueKey = ownerEl.getAttribute('data-owner-cue-key')
  const cueStart = ownerEl.getAttribute('data-owner-cue-start')
  const kind = ownerEl.getAttribute('data-owner-kind')
  const instanceId = ownerEl.getAttribute('data-owner-instance-id')

  if (!cueKey || !cueStart || !kind) return null

  return {
    ownerCueKey: cueKey,
    ownerCueStartMs: Number(cueStart),
    ownerKind: kind as 'word' | 'line' | 'range',
    ownerTokenInstanceId: instanceId || undefined,
  }
}

function resolveSelectionInContainer(
  container: HTMLElement
): { text: string; range: Range } | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) {
    return null
  }

  const text = selection.toString().trim()
  if (!text) {
    return null
  }

  return { text, range }
}

export function useSelectionEvents(
  containerRef: React.RefObject<HTMLElement | null>,
  actions: {
    openRangeMenu: (
      text: string,
      x: number,
      y: number,
      rect: SelectionAnchorRect,
      owner: SelectionOwner
    ) => void
    openLineMenu: (
      text: string,
      x: number,
      y: number,
      rect: SelectionAnchorRect,
      owner: SelectionOwner,
      mode?: 'word' | 'line'
    ) => void
    prepareInteraction: () => void
    cancelInteraction: () => void
    closeMenu: () => void
    closeLookup: () => void
  },
  sharedWasDraggingRef?: React.RefObject<boolean>
) {
  const actionsRef = useRef(actions)
  const interactionStateRef = useRef<InteractionState>('idle')
  const hasPreparedRef = useRef(false)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  // Load cache on mount
  useEffect(() => {
    loadDictCache()
  }, [])

  const commitInteraction = useCallback(() => {
    if (!hasPreparedRef.current) {
      actionsRef.current.prepareInteraction()
      hasPreparedRef.current = true
    }
  }, [])

  const cleanupInteraction = useCallback(() => {
    interactionStateRef.current = 'idle'
    hasPreparedRef.current = false
    pointerDownPosRef.current = null
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // Track active selection to toggle a body class for CSS
  // AND drive semantic interaction gating for movements
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      const container = containerRef.current
      const isDraggingOrSelecting = interactionStateRef.current !== 'idle'

      if (
        selection &&
        !selection.isCollapsed &&
        selection.toString().length > 0 &&
        container?.contains(selection.anchorNode)
      ) {
        document.body.classList.add('is-selecting')
        // SEMANTICS: If we are in an active pointer session, COMMIT interaction
        if (isDraggingOrSelecting) {
          commitInteraction()
        }
      } else {
        document.body.classList.remove('is-selecting')
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.body.classList.remove('is-selecting')
    }
  }, [containerRef, commitInteraction])

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return
      const container = containerRef.current
      if (!container || !container.contains(normalizeMouseTarget(e.target))) return

      interactionStateRef.current = 'pressing'
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY }

      if (sharedWasDraggingRef) {
        sharedWasDraggingRef.current = false
      }

      // Semantic gesture: Long-press hold intent
      const policy =
        e.pointerType === 'touch'
          ? INTERACTION_CONFIG.FILTERS.TOUCH
          : INTERACTION_CONFIG.FILTERS.MOUSE

      if (policy.longPressMs > 0) {
        longPressTimerRef.current = setTimeout(() => {
          if (interactionStateRef.current === 'pressing') {
            commitInteraction()
          }
        }, policy.longPressMs)
      }
    },
    [containerRef, sharedWasDraggingRef, commitInteraction]
  )

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (interactionStateRef.current === 'idle' || !pointerDownPosRef.current) return

    const dx = Math.abs(e.clientX - pointerDownPosRef.current.x)
    const dy = Math.abs(e.clientY - pointerDownPosRef.current.y)

    const policy =
      e.pointerType === 'touch'
        ? INTERACTION_CONFIG.FILTERS.TOUCH
        : INTERACTION_CONFIG.FILTERS.MOUSE

    if (dx > policy.moveThreshold || dy > policy.moveThreshold) {
      if (interactionStateRef.current === 'pressing') {
        interactionStateRef.current = 'selecting'
        // Movement threshold crossed: established selection intent.
        // We wait for selectionchange (SEMANTICS) before committing playback pause.
      }

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
  }, [])

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      // SEMANTICS: Selection commit/cancel only happens on primary button release.
      // If a right-click or other button is released while we were 'pressing' or 'selecting',
      // we DON'T process it as a selection finalization.
      if (interactionStateRef.current === 'idle' || e.button !== 0) {
        // If we were in a non-idle state but released a non-primary button (e.g. right click),
        // we might still be 'selecting' with the left button. Do NOT cleanup yet.
        return
      }

      const container = containerRef.current
      const isDrag = interactionStateRef.current === 'selecting'
      const wasPressing = interactionStateRef.current === 'pressing'

      if (sharedWasDraggingRef) {
        sharedWasDraggingRef.current = isDrag
      }

      const selectedRange = container ? resolveSelectionInContainer(container) : null

      if (!selectedRange) {
        // If we opened an interaction but didn't finish with a range, cancel it.
        // This handles cases like: long-pressed but no range found on release, or noise drags.
        if (hasPreparedRef.current) {
          actionsRef.current.cancelInteraction()
        }

        // Cleanup native selection noise on background clicks
        if (wasPressing && e.button === 0) {
          const targetEl = normalizeMouseTarget(e.target)
          if (
            targetEl?.closest('.subtitle-line') &&
            !targetEl.closest('[data-lookup-word="true"]')
          ) {
            window.getSelection()?.removeAllRanges()
          }
        }
      } else if (isDrag) {
        // Semantic interaction must be established before committing actions
        commitInteraction()

        const targetEl = normalizeMouseTarget(e.target)
        const rect = selectedRange.range.getBoundingClientRect()

        actionsRef.current.openRangeMenu(
          selectedRange.text,
          rect.left + rect.width / 2,
          rect.top,
          {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
          (targetEl && extractOwnerMetadata(targetEl)) || {
            ownerCueKey: 'unknown',
            ownerCueStartMs: 0,
            ownerKind: 'range',
          }
        )
      }

      cleanupInteraction()
    },
    [containerRef, sharedWasDraggingRef, cleanupInteraction, commitInteraction]
  )

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const targetEl = normalizeMouseTarget(e.target)
      if (!targetEl || !container.contains(targetEl)) return

      const targetWordEl = targetEl.closest('[data-lookup-word="true"]')
      const targetLineEl = targetEl.closest('.subtitle-line')

      const selectedRange = resolveSelectionInContainer(container)

      if (selectedRange && targetWordEl) {
        e.preventDefault()
        e.stopPropagation()
        window.getSelection()?.removeAllRanges() // Clear selection to signal switch and avoid re-captures

        commitInteraction()

        const rect = selectedRange.range.getBoundingClientRect()
        actionsRef.current.openLineMenu(
          selectedRange.text,
          rect.left + rect.width / 2,
          rect.top,
          {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
          extractOwnerMetadata(targetEl) || {
            ownerCueKey: 'unknown',
            ownerCueStartMs: 0,
            ownerKind: 'word',
          },
          'word'
        )
        return
      }

      if (targetWordEl) {
        return
      }

      const lineEl = targetLineEl
      if (!lineEl) return

      const lineTextEl = lineEl.querySelector('.subtitle-text')
      const lineText = (lineTextEl?.textContent ?? lineEl.textContent ?? '').trim()
      if (!lineText) return

      // SEMANTICS: Effective menu opening confirms interaction
      e.preventDefault()
      commitInteraction()

      const lineRect = lineEl.getBoundingClientRect()
      actionsRef.current.openLineMenu(
        lineText,
        e.clientX,
        e.clientY,
        {
          left: lineRect.left,
          top: lineRect.top,
          right: lineRect.right,
          bottom: lineRect.bottom,
          width: lineRect.width,
          height: lineRect.height,
        },
        extractOwnerMetadata(lineEl) || {
          ownerCueKey: 'unknown',
          ownerCueStartMs: 0,
          ownerKind: 'line',
        }
      )
    },
    [containerRef, commitInteraction]
  )

  // Effect-based global listener registration to ensure boundary integrity
  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => handlePointerMove(e)
    const handleWindowPointerUp = (e: PointerEvent) => handlePointerUp(e)
    const handleWindowPointerCancel = (_e: PointerEvent) => {
      // cancelInteraction already ignores if not active
      actionsRef.current.cancelInteraction()
      cleanupInteraction()
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true })
    window.addEventListener('pointerup', handleWindowPointerUp, { capture: true })
    window.addEventListener('pointercancel', handleWindowPointerCancel)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp, { capture: true })
      window.removeEventListener('pointercancel', handleWindowPointerCancel)
    }
  }, [cleanupInteraction, handlePointerMove, handlePointerUp])

  // Element-specific down listener
  useEventListener('pointerdown', (e) => handlePointerDown(e as PointerEvent), containerRef)
  useEventListener('contextmenu', (e) => handleContextMenu(e as MouseEvent), containerRef)

  // Disable aggressive browser selection behaviors (triple-click line selection, etc.)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const preventAccidentalSelection = (e: MouseEvent) => {
      if (e.detail >= 2) {
        e.preventDefault()
      }
    }

    container.addEventListener('mousedown', preventAccidentalSelection, { capture: true })
    return () => {
      container.removeEventListener('mousedown', preventAccidentalSelection, { capture: true })
    }
  }, [containerRef])

  return {}
}

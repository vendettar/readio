import {
  arrow,
  autoUpdate,
  type FloatingContext,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react'
import { Book, Copy, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  type DictEntry,
  isLookupEligible,
  type SelectionAnchorPosition,
  type SelectionOwner,
  type SelectionState,
} from '../../lib/selection'
import { viewportLockManager } from '../../lib/selection/viewportLockManager'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu'
import {
  getLookupAnchorStyle,
  getLookupCalloutSide,
  LOOKUP_ANCHOR_GAP,
  LOOKUP_VIEWPORT_MARGIN,
} from './lookupGeometry'

export function restoreSelectionOwnerFocus(owner: SelectionOwner) {
  const id = owner.ownerTokenInstanceId
  const key = owner.ownerCueKey

  // 1. Try exact word instance (most precise)
  let el = id
    ? (document.querySelector(`[data-owner-instance-id="${id}"]`) as HTMLElement | null)
    : null

  // 2. Fallback to owning line
  if ((!el || !document.body.contains(el)) && key && key !== 'unknown') {
    el = document.querySelector(
      `[data-owner-cue-key="${key}"][data-line-index]`
    ) as HTMLElement | null
  }

  // 3. Fallback to transcript container
  if (!el || !document.body.contains(el)) {
    el = document.getElementById('transcript-container')
  }

  if (el && typeof el.focus === 'function') {
    el.focus()
  }
}

/**
 * Consolidates common outside interaction behavior (absorb and dismiss).
 */
export function useDismissSelectionSurface(
  owner: SelectionOwner,
  onClose: (options?: {
    reason?: 'dismiss' | 'switch'
    surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
    surfaceId?: number
  }) => void,
  floatingRef: React.RefObject<HTMLElement | null>,
  onSkipRestoration?: () => void,
  surfaceType?: 'contextMenu' | 'rangeActionMenu' | 'lookup',
  surfaceId?: number
) {
  useEffect(() => {
    const handleOutsidePointerDown = (e: PointerEvent) => {
      let target = e.target as HTMLElement | null
      const floating = floatingRef.current

      if (floating && !floating.contains(target as Node)) {
        // If we hit a backdrop, we need to synchronously check what is underneath it
        // to distinguish between switching (to a word) or dismissing (to background).
        if (e.button === 2 && target?.hasAttribute('data-selection-backdrop')) {
          const backdrop = target as HTMLElement
          backdrop.style.pointerEvents = 'none'
          try {
            target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
          } finally {
            backdrop.style.pointerEvents = 'auto'
          }
        }

        if (e.button === 2) {
          // Identify if the right-click is on an interactive target (word or line)
          const isInteractiveTarget =
            target?.hasAttribute('data-lookup-word') || target?.closest?.('[data-line-index]')

          if (isInteractiveTarget) {
            onSkipRestoration?.()
            onClose({ reason: 'switch', surface: surfaceType, surfaceId })
          } else {
            onClose({ reason: 'dismiss', surface: surfaceType, surfaceId })
            restoreSelectionOwnerFocus(owner)
          }
          return
        }

        // Left click outside: restore focus and resume audio (Absorption)
        e.preventDefault()
        e.stopPropagation()
        onClose({ reason: 'dismiss', surface: surfaceType, surfaceId })
        restoreSelectionOwnerFocus(owner)
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown, { capture: true })
    return () =>
      document.removeEventListener('pointerdown', handleOutsidePointerDown, { capture: true })
  }, [owner, onClose, floatingRef, onSkipRestoration, surfaceType, surfaceId])
}

interface SelectionMenuProps {
  surfaceId: number
  position: SelectionAnchorPosition
  selectedText: string
  owner: SelectionOwner
  onCopy: () => void
  onSearch: () => void
  onLookup: () => void
  onClose: (options?: {
    reason?: 'dismiss' | 'switch'
    surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
    surfaceId?: number
  }) => void
  open?: boolean
}

/**
 * Shared arrow component for floating menus
 */
function MenuArrow({
  context,
  arrowRef,
}: {
  context: FloatingContext
  arrowRef: React.RefObject<HTMLDivElement | null>
}) {
  const { placement, middlewareData } = context
  const arrowData = middlewareData.arrow

  const side = placement.split('-')[0] as 'top' | 'right' | 'bottom' | 'left'
  const staticSide = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }[side]

  if (!staticSide) return null

  return (
    <div
      ref={arrowRef}
      style={{
        position: 'absolute',
        left: arrowData?.x != null ? `${arrowData.x}px` : '',
        top: arrowData?.y != null ? `${arrowData.y}px` : '',
        [staticSide as string]: '-5px',
      }}
      className={cn(
        'h-2.5 w-2.5 rotate-45 border bg-popover',
        side === 'top' && 'border-t-0 border-l-0',
        side === 'bottom' && 'border-b-0 border-r-0',
        side === 'left' && 'border-b-0 border-l-0',
        side === 'right' && 'border-t-0 border-r-0'
      )}
    />
  )
}

function useDismissOnViewportChange(
  onClose: (options?: {
    reason?: 'dismiss' | 'switch'
    surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
    surfaceId?: number
  }) => void,
  restoreFocus?: () => void,
  surfaceType?: 'contextMenu' | 'rangeActionMenu' | 'lookup',
  floatingRef?: React.RefObject<HTMLElement | null>,
  surfaceId?: number
) {
  useEffect(() => {
    let frameId: number | null = null

    const handleViewportChange = (e: Event) => {
      // Ignore scroll events originating from within the floating element
      // (e.g. scrolling the lookup results)
      if (
        e.type === 'scroll' &&
        e.target instanceof Node &&
        floatingRef?.current?.contains(e.target)
      ) {
        return
      }

      if (frameId !== null) return

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        onClose({ reason: 'dismiss', surface: surfaceType, surfaceId })
        restoreFocus?.()
      })
    }

    const viewport = window.visualViewport

    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    viewport?.addEventListener('resize', handleViewportChange)
    viewport?.addEventListener('scroll', handleViewportChange)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)
      viewport?.removeEventListener('resize', handleViewportChange)
      viewport?.removeEventListener('scroll', handleViewportChange)
    }
  }, [onClose, restoreFocus, surfaceType, floatingRef, surfaceId])
}

/**
 * Vertical list menu used for right-click context actions
 */
export function WordContextMenu({
  surfaceId,
  position,
  selectedText,
  menuMode,
  owner,
  onCopy,
  onSearch,
  onLookup,
  onClose,
  open = true,
}: SelectionMenuProps & { menuMode: 'word' | 'line' }) {
  const { t } = useTranslation()

  const isEligibleForLookup = (menuMode === 'word' || !menuMode) && isLookupEligible(selectedText)

  const menuItems = useMemo(
    () => [
      {
        key: 'copy',
        icon: Copy,
        label: t(menuMode === 'word' ? 'ariaCopy' : 'copyParagraph'),
        onClick: onCopy,
        visible: true,
      },
      {
        key: 'search',
        icon: Search,
        label: t('searchWeb'),
        onClick: onSearch,
        visible: true,
      },
      {
        key: 'lookup',
        icon: Book,
        label: t('lookUp'),
        onClick: onLookup,
        visible: isEligibleForLookup,
        className: 'font-medium text-primary',
      },
    ],
    [t, menuMode, onCopy, onSearch, onLookup, isEligibleForLookup]
  )

  const visibleMenuItems = useMemo(() => menuItems.filter((item) => item.visible), [menuItems])

  const restoreFocus = useCallback(() => {
    restoreSelectionOwnerFocus(owner)
  }, [owner])

  const arrowRef = useRef<HTMLDivElement>(null)
  const skipRestoreRef = useRef(false)
  const { refs, floatingStyles, context, placement } = useFloating({
    placement: 'top',
    middleware: [
      offset(8),
      flip({
        fallbackPlacements: ['bottom', 'top-start', 'top-end', 'bottom-start', 'bottom-end'],
      }),
      shift({ padding: LOOKUP_VIEWPORT_MARGIN }),
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
  })

  // Set virtual reference point from position for the floating engine
  useEffect(() => {
    refs.setReference({
      getBoundingClientRect: () =>
        menuMode === 'word' && position.rect
          ? (position.rect as DOMRect)
          : new DOMRect(position.x, position.y, 0, 0),
    })
  }, [position, menuMode, refs])

  useDismissSelectionSurface(
    owner,
    onClose,
    refs.floating,
    () => {
      skipRestoreRef.current = true
    },
    'contextMenu',
    surfaceId
  )

  const dismiss = useDismiss(context, {
    enabled: true,
    outsidePress: false,
    escapeKey: true,
  })

  const { getFloatingProps } = useInteractions([dismiss])
  useDismissOnViewportChange(onClose, restoreFocus, 'contextMenu', refs.floating, surfaceId)

  return (
    <FloatingPortal>
      <div className="fixed inset-0 z-menu cursor-default" data-selection-backdrop="true" />
      <DropdownMenu
        open={open}
        modal={false}
        onOpenChange={(open) =>
          !open && onClose({ reason: 'dismiss', surface: 'contextMenu', surfaceId })
        }
      >
        <DropdownMenuContent
          {...getFloatingProps({
            style: floatingStyles,
          })}
          ref={refs.setFloating}
          data-side={placement}
          data-testid="word-context-menu"
          data-selection-surface="true"
          className="overflow-visible"
          onCloseAutoFocus={(e: Event) => {
            e.preventDefault()
            if (!skipRestoreRef.current) {
              restoreFocus()
            }
            skipRestoreRef.current = false
          }}
        >
          <MenuArrow context={context} arrowRef={arrowRef} />
          <div className="relative z-10 flex flex-col gap-0.5 p-1">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem
                  key={item.key}
                  className={cn(
                    'flex cursor-default select-none items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm whitespace-nowrap outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                    item.className
                  )}
                  onSelect={(e) => {
                    e.preventDefault()
                    if (item.key === 'lookup') {
                      skipRestoreRef.current = true
                    }
                    item.onClick()
                    onClose({ reason: 'dismiss', surface: 'contextMenu', surfaceId })
                  }}
                >
                  {item.label}
                  <Icon size={16} className="ms-auto shrink-0 opacity-70" />
                </DropdownMenuItem>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </FloatingPortal>
  )
}

/**
 * Horizontal bubble menu used for range selection actions
 */
export function RangeActionMenu({
  surfaceId,
  position,
  selectedText,
  owner,
  onCopy,
  onSearch,
  onLookup,
  onClose,
  open = true,
}: SelectionMenuProps) {
  const { t } = useTranslation()

  const restoreFocus = useCallback(() => {
    restoreSelectionOwnerFocus(owner)
  }, [owner])

  const arrowRef = useRef<HTMLDivElement>(null)
  const skipRestoreRef = useRef(false)
  const { refs, floatingStyles, context, placement } = useFloating({
    placement: 'top',
    middleware: [
      offset(8),
      flip(),
      shift({ padding: LOOKUP_VIEWPORT_MARGIN }),
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
  })

  // Set virtual reference point from position
  useEffect(() => {
    refs.setReference({
      getBoundingClientRect: () =>
        position.rect ? (position.rect as DOMRect) : new DOMRect(position.x, position.y, 0, 0),
    })
  }, [position, refs])

  useDismissSelectionSurface(
    owner,
    onClose,
    refs.floating,
    () => {
      skipRestoreRef.current = true
    },
    'rangeActionMenu',
    surfaceId
  )

  const isEligibleForLookup = isLookupEligible(selectedText)

  const dismiss = useDismiss(context, {
    enabled: true,
    outsidePress: false,
    escapeKey: true,
  })
  const { getFloatingProps } = useInteractions([dismiss])
  useDismissOnViewportChange(onClose, restoreFocus, 'rangeActionMenu', refs.floating, surfaceId)

  const menuItems = useMemo(
    () => [
      {
        key: 'lookup',
        icon: Book,
        label: t('lookUp'),
        onClick: onLookup,
        visible: isEligibleForLookup,
        className: 'font-medium text-primary',
      },
      {
        key: 'copy',
        icon: Copy,
        label: t('copySelected'),
        onClick: onCopy,
        visible: true,
      },
      {
        key: 'search',
        icon: Search,
        label: t('navSearch'),
        onClick: onSearch,
        visible: true,
      },
    ],
    [t, onCopy, onSearch, onLookup, isEligibleForLookup]
  )

  const visibleMenuItems = useMemo(() => menuItems.filter((item) => item.visible), [menuItems])

  return (
    <FloatingPortal>
      <div className="fixed inset-0 z-menu cursor-default" data-selection-backdrop="true" />
      <DropdownMenu
        open={open}
        modal={false}
        onOpenChange={(open) =>
          !open && onClose({ reason: 'dismiss', surface: 'rangeActionMenu', surfaceId })
        }
      >
        <DropdownMenuContent
          {...getFloatingProps({
            style: floatingStyles,
          })}
          ref={refs.setFloating}
          data-side={placement}
          data-testid="range-action-menu"
          data-selection-surface="true"
          className="overflow-visible"
          onCloseAutoFocus={(e: Event) => {
            e.preventDefault()
            if (!skipRestoreRef.current) {
              restoreFocus()
            }
            skipRestoreRef.current = false
          }}
        >
          <MenuArrow context={context} arrowRef={arrowRef} />
          <div className="relative z-10 flex flex-col gap-0.5 p-1">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem
                  key={item.key}
                  className={cn(
                    'flex cursor-default select-none items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm whitespace-nowrap outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                    item.className
                  )}
                  onSelect={(e) => {
                    e.preventDefault()
                    if (item.key === 'lookup') {
                      skipRestoreRef.current = true
                    }
                    item.onClick()
                    onClose({ reason: 'dismiss', surface: 'rangeActionMenu', surfaceId })
                  }}
                >
                  {item.label}
                  <Icon size={16} className="ms-auto shrink-0 opacity-70" />
                </DropdownMenuItem>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </FloatingPortal>
  )
}

interface LookupCalloutProps {
  surfaceId: number
  position: SelectionAnchorPosition
  word: string
  loading: boolean
  errorKey: SelectionState['lookupErrorKey']
  result: DictEntry | null
  owner: SelectionOwner
  onClose: (options?: {
    reason?: 'dismiss' | 'switch'
    surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
    surfaceId?: number
  }) => void
}

export function LookupCallout({
  surfaceId,
  position,
  word,
  loading,
  errorKey,
  result,
  owner,
  onClose,
}: LookupCalloutProps) {
  const { t } = useTranslation()

  const restoreFocus = useCallback(() => {
    restoreSelectionOwnerFocus(owner)
  }, [owner])

  const skipRestoreRef = useRef(false)
  // Use Floating UI for precise positioning and non-modal behavior
  const { refs, floatingStyles, context, placement } = useFloating({
    placement: getLookupCalloutSide(position),
    middleware: [
      offset(LOOKUP_ANCHOR_GAP),
      flip({ fallbackPlacements: ['left', 'right', 'top', 'bottom'] }),
      shift({ padding: LOOKUP_VIEWPORT_MARGIN }),
    ],
    whileElementsMounted: autoUpdate,
    open: true,
    onOpenChange: (open) => {
      if (!open) {
        onClose({ reason: 'dismiss', surface: 'lookup', surfaceId })
        if (!skipRestoreRef.current) {
          restoreFocus()
        }
        skipRestoreRef.current = false
      }
    },
  })

  useDismissSelectionSurface(
    owner,
    onClose,
    refs.floating,
    () => {
      skipRestoreRef.current = true
    },
    'lookup',
    surfaceId
  )

  const dismiss = useDismiss(context, {
    enabled: true,
    outsidePress: false, // Handled by our manual backdrop for absorption
    escapeKey: true,
  })

  const { getFloatingProps } = useInteractions([dismiss])
  useDismissOnViewportChange(onClose, restoreFocus, 'lookup', refs.floating, surfaceId)

  // Set virtual reference point from position
  useEffect(() => {
    refs.setReference({
      getBoundingClientRect: () =>
        position.rect ? (position.rect as DOMRect) : new DOMRect(position.x, position.y, 0, 0),
    })
  }, [position, refs])

  return (
    <FloatingPortal>
      <div className="fixed inset-0 z-menu cursor-default" data-selection-backdrop="true" />
      <div
        data-testid="lookup-anchor"
        style={getLookupAnchorStyle(position)}
        aria-hidden="true"
        className="pointer-events-none opacity-0"
      />
      <FloatingFocusManager context={context} modal={false}>
        <div
          {...getFloatingProps({
            ref: refs.setFloating,
            role: 'dialog',
            'aria-label': t('lookUp'),
            'aria-describedby': 'lookup-description',
            className: cn(
              'fixed z-menu w-[min(320px,calc(100vw-2rem))] max-h-[75vh] overflow-visible rounded-xl border bg-popover p-0 text-popover-foreground shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-200'
            ),
            style: floatingStyles,
          })}
          data-side={placement}
          data-testid="lookup-callout"
          data-selection-surface="true"
        >
          <div className="sr-only" id="lookup-description">
            {t('lookUpResult')}
          </div>
          <div className="flex max-h-96 flex-col overflow-hidden rounded-xl bg-popover">
            <div className="flex items-center justify-between border-b p-4 select-none">
              <div className="text-lg font-bold tracking-tight">{word}</div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  restoreFocus()
                  onClose({ reason: 'dismiss', surface: 'lookup', surfaceId })
                }}
                aria-label={t('ariaClose')}
              >
                <X size={18} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
              <LookupResultView loading={loading} errorKey={errorKey} result={result} />
            </div>
          </div>
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  )
}

interface LookupResultViewProps {
  loading: boolean
  errorKey: SelectionState['lookupErrorKey']
  result: DictEntry | null
}

function LookupResultView({ loading, errorKey, result }: LookupResultViewProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="animate-pulse py-8 text-center text-sm text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  if (errorKey) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        {t(errorKey)}
      </div>
    )
  }

  if (result === null) {
    return null
  }

  return (
    <div className="space-y-4 pb-4">
      {result.phonetic && (
        <div className="text-sm font-serif italic text-muted-foreground">{result.phonetic}</div>
      )}
      {result.meanings.map((meaning, idx: number) => (
        <div key={idx} className="space-y-2">
          <div className="text-xs font-black uppercase tracking-widest text-primary/60">
            {meaning.partOfSpeech}
          </div>
          <ol className="space-y-3">
            {meaning.definitions.map((def, defIdx: number) => (
              <li key={defIdx} className="space-y-1 text-sm">
                <div className="leading-relaxed">{def.definition}</div>
                {def.example && (
                  <div className="rounded-md border-s-2 border-primary/20 bg-muted/30 p-2 text-xs italic text-muted-foreground">
                    &quot;{def.example}&quot;
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

interface SelectionUIProps {
  state: SelectionState
  onCopy: () => void
  onSearch: () => void
  onLookup: () => void
  onClose: (options?: {
    reason?: 'dismiss' | 'switch'
    surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
  }) => void
}

export function SelectionUI({ state, onCopy, onSearch, onLookup, onClose }: SelectionUIProps) {
  const surface = state.surface

  // Freeze/Unfreeze viewport when a selection surface is active.
  // This prevents scrolling (body and sub-containers) and zooming, maintaining
  // absolute visual anchor stability for the pinned menu/callout.
  const hasActiveSurface = surface.type !== 'none'
  useEffect(() => {
    if (!hasActiveSurface) return

    viewportLockManager.acquire()
    return () => {
      viewportLockManager.release()
    }
  }, [hasActiveSurface]) // Synchronize lock life-cycle with active selection state

  switch (surface.type) {
    case 'contextMenu':
      return (
        <WordContextMenu
          surfaceId={surface.surfaceId}
          position={surface.position}
          selectedText={surface.selectedText}
          menuMode={surface.menuMode}
          owner={surface.owner}
          onCopy={onCopy}
          onSearch={onSearch}
          onLookup={onLookup}
          onClose={onClose}
        />
      )

    case 'rangeActionMenu':
      return (
        <RangeActionMenu
          surfaceId={surface.surfaceId}
          position={surface.position}
          selectedText={surface.selectedText}
          owner={surface.owner}
          onCopy={onCopy}
          onSearch={onSearch}
          onLookup={onLookup}
          onClose={onClose}
        />
      )

    case 'lookup':
      return (
        <LookupCallout
          surfaceId={surface.surfaceId}
          position={surface.position}
          word={surface.word}
          loading={state.lookupLoading}
          errorKey={state.lookupErrorKey}
          result={state.lookupResult}
          owner={surface.owner}
          onClose={onClose}
        />
      )

    default:
      return null
  }
}

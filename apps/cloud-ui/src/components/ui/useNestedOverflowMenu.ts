import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type OutsideInteractionBehavior = 'dismiss-only' | 'dismiss-and-allow-click-through'

interface UseNestedOverflowMenuOptions<TStep extends string> {
  initialStep: TStep
  closeOnNestedOutside?: boolean
  onMenuClose?: () => void
  outsideInteractionBehavior?: OutsideInteractionBehavior
}

export function useNestedOverflowMenu<TStep extends string>({
  initialStep,
  closeOnNestedOutside = true,
  onMenuClose,
  outsideInteractionBehavior = 'dismiss-only',
}: UseNestedOverflowMenuOptions<TStep>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuContentRef = useRef<HTMLDivElement | null>(null)
  const suppressedClickTargetRef = useRef<Node | null>(null)
  const suppressedClickTimeoutRef = useRef<number | null>(null)
  const wasMenuOpenRef = useRef(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [step, setStep] = useState<TStep>(initialStep)

  const clearSuppressedClick = useCallback(() => {
    suppressedClickTargetRef.current = null
    if (suppressedClickTimeoutRef.current !== null) {
      window.clearTimeout(suppressedClickTimeoutRef.current)
      suppressedClickTimeoutRef.current = null
    }
  }, [])

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false)
    setStep(initialStep)
  }, [initialStep])

  const handleOpenChange = (open: boolean) => {
    setIsMenuOpen(open)
    if (!open) {
      setStep(initialStep)
    }
  }

  useEffect(() => {
    if (wasMenuOpenRef.current && !isMenuOpen) {
      onMenuClose?.()
    }
    wasMenuOpenRef.current = isMenuOpen
  }, [isMenuOpen, onMenuClose])

  useEffect(() => {
    if (!isMenuOpen || step === initialStep) return

    const handleOutsideInteraction = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuContentRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return

      if (outsideInteractionBehavior === 'dismiss-only') {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        suppressedClickTargetRef.current = target
        if (suppressedClickTimeoutRef.current !== null) {
          window.clearTimeout(suppressedClickTimeoutRef.current)
        }
        suppressedClickTimeoutRef.current = window.setTimeout(() => {
          clearSuppressedClick()
        }, 250)
      } else {
        clearSuppressedClick()
      }

      if (closeOnNestedOutside) {
        closeMenu()
        return
      }

      setStep(initialStep)
    }

    window.addEventListener('mousedown', handleOutsideInteraction, true)
    window.addEventListener('click', handleOutsideInteraction, true)

    return () => {
      window.removeEventListener('mousedown', handleOutsideInteraction, true)
      window.removeEventListener('click', handleOutsideInteraction, true)
    }
  }, [
    clearSuppressedClick,
    closeOnNestedOutside,
    closeMenu,
    initialStep,
    isMenuOpen,
    outsideInteractionBehavior,
    step,
  ])

  useEffect(() => {
    const handleSuppressedClick = (event: MouseEvent) => {
      const suppressedTarget = suppressedClickTargetRef.current
      const target = event.target
      if (!(suppressedTarget instanceof Node) || !(target instanceof Node)) return
      if (target !== suppressedTarget && !suppressedTarget.contains(target)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      clearSuppressedClick()
    }

    window.addEventListener('click', handleSuppressedClick, true)
    return () => {
      window.removeEventListener('click', handleSuppressedClick, true)
      clearSuppressedClick()
    }
  }, [clearSuppressedClick])

  return {
    closeMenu,
    handleOpenChange,
    isMenuOpen,
    menuContentRef,
    setStep,
    step,
    triggerRef,
  }
}

interface UseOverflowMenuConfirmFocusOptions<TStep extends string> {
  initialStep: TStep
  confirmStep: TStep
  isMenuOpen: boolean
  step: TStep
  confirmFocusRef: RefObject<HTMLElement | null>
  menuFocusRef: RefObject<HTMLElement | null>
}

export function useOverflowMenuConfirmFocus<TStep extends string>({
  initialStep,
  confirmStep,
  isMenuOpen,
  step,
  confirmFocusRef,
  menuFocusRef,
}: UseOverflowMenuConfirmFocusOptions<TStep>) {
  const previousStepRef = useRef(initialStep)

  useLayoutEffect(() => {
    if (!isMenuOpen) {
      previousStepRef.current = initialStep
      return
    }

    const previousStep = previousStepRef.current
    previousStepRef.current = step

    if (step === confirmStep && previousStep !== confirmStep) {
      confirmFocusRef.current?.focus()
      return
    }

    if (step === initialStep && previousStep === confirmStep) {
      menuFocusRef.current?.focus()
    }
  }, [confirmFocusRef, confirmStep, initialStep, isMenuOpen, menuFocusRef, step])
}

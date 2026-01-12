// src/hooks/useCarouselLayout.ts
// Custom hook for responsive carousel layout calculation

import { useCallback, useEffect, useRef, useState } from 'react'
import { BREAKPOINTS, CAROUSEL_DEFAULTS } from '../constants/layout'

interface CarouselLayoutConfig {
  gap?: number
  rows?: number // Supports multi-row grids
  minItemWidth?: number
  maxItemWidth?: number
  fixedModeBreakpoint?: number
  maxVisibleItems?: number
  minVisibleItems?: number
}

interface CarouselLayoutResult {
  scrollRef: React.RefObject<HTMLDivElement | null>
  itemWidth: number
  visibleCount: number
  canScrollLeft: boolean
  canScrollRight: boolean
  handleScroll: (direction: 'left' | 'right') => void
  updateScrollButtons: () => void
}

const DEFAULT_CONFIG: Required<CarouselLayoutConfig> = {
  gap: CAROUSEL_DEFAULTS.GAP,
  rows: 1,
  minItemWidth: CAROUSEL_DEFAULTS.MIN_ITEM_WIDTH,
  maxItemWidth: CAROUSEL_DEFAULTS.MAX_ITEM_WIDTH,
  fixedModeBreakpoint: BREAKPOINTS.TABLET, // Use Tablet breakpoint as the fixed mode trigger
  maxVisibleItems: CAROUSEL_DEFAULTS.MAX_VISIBLE_ITEMS,
  minVisibleItems: CAROUSEL_DEFAULTS.MIN_VISIBLE_ITEMS,
}

export function useCarouselLayout(
  _itemCount: number,
  config: CarouselLayoutConfig = {}
): CarouselLayoutResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const {
    gap,
    rows,
    minItemWidth,
    maxItemWidth,
    fixedModeBreakpoint,
    maxVisibleItems,
    minVisibleItems,
  } = mergedConfig

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Dynamic initial state based on window width to reduce hydration jumps
  const getInitialVisible = () => {
    if (typeof window === 'undefined') return maxVisibleItems
    const width = window.innerWidth
    if (width < fixedModeBreakpoint) return rows > 1 ? 2 : minVisibleItems
    return width < 1200 ? minVisibleItems : maxVisibleItems
  }

  const [itemWidth, setItemWidth] = useState(maxItemWidth)
  const [visibleCount, setVisibleCount] = useState(getInitialVisible)

  const itemWidthRef = useRef(maxItemWidth)
  const visibleCountRef = useRef(getInitialVisible())

  const updateScrollButtons = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5)
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: _itemCount is needed to trigger recalculation when props change
  const calculateItemWidth = useCallback(() => {
    if (!scrollRef.current) return

    const containerWidth = scrollRef.current.clientWidth
    const viewportWidth = window.innerWidth
    const oldItemWidth = itemWidthRef.current
    const oldScrollLeft = scrollRef.current.scrollLeft

    // Use a lower breakpoint for mobile/fixed mode to allow 7-6-5 scaling on tablets
    const effectiveFixedBreakpoint = BREAKPOINTS.TABLET

    let newItemWidth = maxItemWidth
    let newVisibleCount = maxVisibleItems

    // 1. Determine column count (Respecting maxVisibleItems prop)
    if (viewportWidth < effectiveFixedBreakpoint) {
      // MOBILE/FIXED MODE: Lock at 2 columns for grid, or minVisibleItems for carousel
      newVisibleCount = rows > 1 ? 2 : minVisibleItems
    } else {
      // DYNAMIC MODE: Try to fit maxVisibleItems first, then step down
      const stepDown1 = maxVisibleItems - 1

      const widthMax = (containerWidth - (maxVisibleItems - 1) * gap) / maxVisibleItems
      const widthStep1 = (containerWidth - (stepDown1 - 1) * gap) / stepDown1

      if (widthMax >= minItemWidth) {
        newVisibleCount = maxVisibleItems
      } else if (stepDown1 > minVisibleItems && widthStep1 >= minItemWidth) {
        newVisibleCount = stepDown1
      } else {
        // Lock at minVisibleItems
        newVisibleCount = minVisibleItems
      }
    }

    // 2. Calculate Item Width
    if (viewportWidth < effectiveFixedBreakpoint) {
      // Mobile view: items should be smaller (industry standard is ~140-150px for these cards)
      // This ensures that on a phone, we still see 2+ items comfortably.
      newItemWidth = 150
    } else {
      // Dynamic view: stretch to fill the container with exactly newVisibleCount items
      const totalGaps = (newVisibleCount - 1) * gap
      newItemWidth = (containerWidth - totalGaps) / newVisibleCount
    }

    // 3. Sync CSS Variables
    if (scrollRef.current?.parentElement) {
      const cssVarName = rows > 1 ? '--column-width' : '--item-width'
      scrollRef.current.parentElement.style.setProperty(cssVarName, `${newItemWidth}px`)
    }

    // 4. Preserve Scroll Position
    if (oldScrollLeft > 0) {
      const oldItemTotalWidth = oldItemWidth + gap
      const firstVisibleIndex = Math.round(oldScrollLeft / oldItemTotalWidth)
      const newItemTotalWidth = newItemWidth + gap
      scrollRef.current.scrollLeft = firstVisibleIndex * newItemTotalWidth
    }

    itemWidthRef.current = newItemWidth
    visibleCountRef.current = newVisibleCount
    setItemWidth(newItemWidth)
    setVisibleCount(newVisibleCount)
  }, [_itemCount, gap, rows, minItemWidth, maxItemWidth, maxVisibleItems, minVisibleItems])

  const handleScroll = useCallback(
    (direction: 'left' | 'right') => {
      if (!scrollRef.current) return

      const currentItemWidth = itemWidthRef.current
      const currentVisibleCount = visibleCountRef.current
      const scrollDistance = (currentItemWidth + gap) * currentVisibleCount

      const targetScroll =
        direction === 'left'
          ? scrollRef.current.scrollLeft - scrollDistance
          : scrollRef.current.scrollLeft + scrollDistance

      scrollRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' })
    },
    [gap]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollRef.current is needed to attach/detach observer
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    window.requestAnimationFrame(() => {
      calculateItemWidth()
      updateScrollButtons()
    })

    // Use scroll event for real-time button updates
    container.addEventListener('scroll', updateScrollButtons, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        calculateItemWidth()
        updateScrollButtons()
      })
    })

    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('scroll', updateScrollButtons)
      resizeObserver.disconnect()
    }
  }, [calculateItemWidth, updateScrollButtons, scrollRef.current])

  return {
    scrollRef,
    itemWidth,
    visibleCount,
    canScrollLeft,
    canScrollRight,
    handleScroll,
    updateScrollButtons,
  }
}

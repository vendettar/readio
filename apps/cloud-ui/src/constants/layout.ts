// src/constants/layout.ts
/**
 * Shared layout constants and responsive breakpoints
 */

export const BREAKPOINTS = {
  MOBILE: 480,
  TABLET: 800,
  DESKTOP: 1150,
  WIDE: 1440,
}

export const CAROUSEL_DEFAULTS = {
  GAP: 16,
  MAX_VISIBLE_ITEMS: 7,
  MIN_VISIBLE_ITEMS: 5,
  MIN_ITEM_WIDTH: 140,
  MAX_ITEM_WIDTH: 240,
  GRID_MIN_ITEM_WIDTH: 296, // Used for sync between grid and carousels
}

export const CAROUSEL_SKELETON_ITEM_WIDTH_CLASS = 'w-60' as const

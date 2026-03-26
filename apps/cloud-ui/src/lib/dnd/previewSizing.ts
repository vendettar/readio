import type { ViewDensity } from '../../components/Files/types'

const PREVIEW_WIDTH_BY_DENSITY: Record<ViewDensity, string> = {
  comfortable: 'w-72',
  compact: 'w-64',
}

export function getDragPreviewWidthClass(density: ViewDensity): string {
  return PREVIEW_WIDTH_BY_DENSITY[density]
}

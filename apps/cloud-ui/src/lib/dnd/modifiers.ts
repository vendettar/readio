import type { Modifier } from '@dnd-kit/core'

function resolveClientPosition(
  activatorEvent: Event | null | undefined
): { clientX: number; clientY: number } | null {
  if (!activatorEvent) return null

  if ('clientX' in activatorEvent && 'clientY' in activatorEvent) {
    const clientX = (activatorEvent as MouseEvent).clientX
    const clientY = (activatorEvent as MouseEvent).clientY
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      return { clientX, clientY }
    }
  }

  if ('touches' in activatorEvent || 'changedTouches' in activatorEvent) {
    const touchEvent = activatorEvent as TouchEvent
    const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0]
    if (!touch) return null
    if (!Number.isFinite(touch.clientX) || !Number.isFinite(touch.clientY)) {
      return null
    }
    return { clientX: touch.clientX, clientY: touch.clientY }
  }

  return null
}

export const snapCenterCursor: Modifier = ({ transform, activatorEvent, activeNodeRect }) => {
  if (!activatorEvent || !activeNodeRect) return transform

  const position = resolveClientPosition(activatorEvent)
  if (!position) return transform

  return {
    ...transform,
    x: transform.x + (position.clientX - activeNodeRect.left),
    y: transform.y + (position.clientY - activeNodeRect.top),
  }
}

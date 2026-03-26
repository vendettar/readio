import { describe, expect, it } from 'vitest'
import { snapCenterCursor } from '../modifiers'

const baseTransform = { x: 10, y: 20, scaleX: 1, scaleY: 1 }
const activeNodeRect = { left: 40, top: 50 }
type ModifierArgs = Parameters<typeof snapCenterCursor>[0]

function applyModifier({
  transform = baseTransform,
  activatorEvent = null,
  nodeRect = activeNodeRect,
}: {
  transform?: typeof baseTransform
  activatorEvent?: Event | null
  nodeRect?: { left: number; top: number } | null
}) {
  return snapCenterCursor({
    transform,
    activatorEvent,
    activeNodeRect: nodeRect,
  } as unknown as ModifierArgs)
}

describe('snapCenterCursor', () => {
  it('computes transform using mouse activator coordinates', () => {
    const activatorEvent = new MouseEvent('pointerdown', { clientX: 100, clientY: 130 })

    const next = applyModifier({ activatorEvent })

    expect(next.x).toBe(70)
    expect(next.y).toBe(100)
  })

  it('computes transform using touch activator coordinates from touches[0]', () => {
    const activatorEvent = {
      touches: [{ clientX: 200, clientY: 240 }],
      changedTouches: [],
    } as unknown as Event

    const next = applyModifier({ activatorEvent })

    expect(next.x).toBe(170)
    expect(next.y).toBe(210)
  })

  it('computes transform using changedTouches[0] when touches is empty', () => {
    const activatorEvent = {
      touches: [],
      changedTouches: [{ clientX: 140, clientY: 170 }],
    } as unknown as Event

    const next = applyModifier({ activatorEvent })

    expect(next.x).toBe(110)
    expect(next.y).toBe(140)
  })

  it('returns original transform when activatorEvent or activeNodeRect is missing', () => {
    const noEvent = applyModifier({ activatorEvent: null })
    const noRect = applyModifier({
      activatorEvent: new MouseEvent('pointerdown', { clientX: 120, clientY: 160 }),
      nodeRect: null,
    })

    expect(noEvent).toBe(baseTransform)
    expect(noRect).toBe(baseTransform)
  })

  it('returns original transform when touch coordinates are missing', () => {
    const activatorEvent = {
      touches: [{}],
      changedTouches: [],
    } as unknown as Event

    const next = applyModifier({ activatorEvent })

    expect(next).toBe(baseTransform)
  })
})

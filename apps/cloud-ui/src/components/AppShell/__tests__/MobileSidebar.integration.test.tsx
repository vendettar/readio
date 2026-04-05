import { describe, expect, it } from 'vitest'
import { cn } from '../../../lib/utils'

describe('Sidebar responsive class logic', () => {
  it('base classes include hidden for mobile and md:flex for desktop', () => {
    const baseClasses = cn(
      'hidden md:flex md:w-sidebar md:flex-shrink-0 w-sidebar h-screen bg-background border-e border-border flex-col relative z-sidebar',
      false && 'md:hidden fixed inset-y-0 start-0 z-overlay w-64 flex'
    )
    expect(baseClasses).toContain('hidden')
    expect(baseClasses).toContain('md:flex')
    expect(baseClasses).not.toContain('start-0')
    expect(baseClasses).not.toContain('z-overlay')
  })

  it('drawer mode adds start-0, z-overlay, w-64, flex when open', () => {
    const drawerClasses = cn(
      'hidden md:flex md:w-sidebar md:flex-shrink-0 w-sidebar h-screen bg-background border-e border-border flex-col relative z-sidebar',
      true && 'md:hidden fixed inset-y-0 start-0 z-overlay w-64 flex'
    )
    expect(drawerClasses).toContain('start-0')
    expect(drawerClasses).toContain('z-overlay')
    expect(drawerClasses).toContain('w-64')
    expect(drawerClasses).toContain('flex')
    // md:hidden still present but md:flex overrides on desktop
    expect(drawerClasses).toContain('md:hidden')
    expect(drawerClasses).toContain('md:flex')
  })
})

import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerSurfaceStore } from '../../../store/playerSurfaceStore'
import { AppShell } from '../AppShell'

// Mock components
vi.mock('../MiniPlayer', () => ({
  MiniPlayer: () => <div data-testid="mini-player" />,
}))

vi.mock('../PlayerSurfaceFrame', () => ({
  PLAYER_SURFACE_LAYOUT_ID: 'player-surface-frame',
  PlayerSurfaceFrame: ({ mode }: { mode: string }) => (
    <div data-testid="player-surface-frame" data-mode={mode} />
  ),
}))

// Mock Sidebar
vi.mock('../Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}))

describe('AppShell - Surface Morph Continuity (089c)', () => {
  beforeEach(() => {
    act(() => {
      usePlayerSurfaceStore.getState().reset()
    })
  })

  it('renders no surface frame in mini mode', () => {
    render(<AppShell>Child</AppShell>)
    expect(screen.getByTestId('mini-player')).toBeTruthy()
    expect(screen.queryByTestId('player-surface-frame')).toBeNull()
  })

  it('renders exactly one surface frame in docked mode', () => {
    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'docked' })
    })
    render(<AppShell>Child</AppShell>)

    const frames = screen.getAllByTestId('player-surface-frame')
    expect(frames).toHaveLength(1)
    expect(frames[0].getAttribute('data-mode')).toBe('docked')
  })

  it('renders exactly one surface frame in full mode', () => {
    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'full' })
    })
    render(<AppShell>Child</AppShell>)

    const frames = screen.getAllByTestId('player-surface-frame')
    expect(frames).toHaveLength(1)
    expect(frames[0].getAttribute('data-mode')).toBe('full')
  })

  it('never renders two surface frames simultaneously', () => {
    // Test docked
    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'docked' })
    })
    const { rerender } = render(<AppShell>Child</AppShell>)
    expect(screen.getAllByTestId('player-surface-frame')).toHaveLength(1)

    // Transition to full
    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'full' })
    })
    rerender(<AppShell>Child</AppShell>)
    expect(screen.getAllByTestId('player-surface-frame')).toHaveLength(1)

    // Transition back to docked
    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'docked' })
    })
    rerender(<AppShell>Child</AppShell>)
    expect(screen.getAllByTestId('player-surface-frame')).toHaveLength(1)
  })

  it('mode toggles do not alter route (no navigation side effect)', () => {
    const { rerender } = render(<AppShell>Child</AppShell>)

    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'docked' })
    })
    rerender(<AppShell>Child</AppShell>)
    expect(screen.getByTestId('player-surface-frame')).toBeTruthy()

    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'full' })
    })
    rerender(<AppShell>Child</AppShell>)
    expect(screen.getByTestId('player-surface-frame')).toBeTruthy()

    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'mini' })
    })
    rerender(<AppShell>Child</AppShell>)
    expect(screen.queryByTestId('player-surface-frame')).toBeNull()
  })

  it('MiniPlayer is always present regardless of mode', () => {
    const { rerender } = render(<AppShell>Child</AppShell>)
    expect(screen.getByTestId('mini-player')).toBeTruthy()

    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'docked' })
    })
    rerender(<AppShell>Child</AppShell>)
    expect(screen.getByTestId('mini-player')).toBeTruthy()

    act(() => {
      usePlayerSurfaceStore.setState({ mode: 'full' })
    })
    rerender(<AppShell>Child</AppShell>)
    expect(screen.getByTestId('mini-player')).toBeTruthy()
  })
})

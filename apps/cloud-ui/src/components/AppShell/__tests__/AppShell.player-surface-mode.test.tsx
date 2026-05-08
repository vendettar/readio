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

describe('AppShell - Player Surface Mode', () => {
  beforeEach(() => {
    usePlayerSurfaceStore.getState().reset()
  })

  it('renders MiniPlayer by default', async () => {
    render(<AppShell>Child</AppShell>)
    expect(await screen.findByTestId('mini-player')).toBeTruthy()
    expect(screen.queryByTestId('player-surface-frame')).toBeNull()
  })

  it('renders PlayerSurfaceFrame in docked mode', async () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    render(<AppShell>Child</AppShell>)

    expect(await screen.findByTestId('mini-player')).toBeTruthy()
    const frame = await screen.findByTestId('player-surface-frame')
    expect(frame).toBeTruthy()
    expect(frame.getAttribute('data-mode')).toBe('docked')
  })

  it('renders PlayerSurfaceFrame in full mode', async () => {
    usePlayerSurfaceStore.setState({ mode: 'full' })
    render(<AppShell>Child</AppShell>)

    expect(await screen.findByTestId('mini-player')).toBeTruthy()
    const frame = await screen.findByTestId('player-surface-frame')
    expect(frame).toBeTruthy()
    expect(frame.getAttribute('data-mode')).toBe('full')
  })

  it('collapses docked surface on browser history navigation (popstate)', async () => {
    usePlayerSurfaceStore.setState({ mode: 'docked' })
    render(<AppShell>Child</AppShell>)
    expect((await screen.findByTestId('player-surface-frame')).getAttribute('data-mode')).toBe(
      'docked'
    )

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(usePlayerSurfaceStore.getState().mode).toBe('mini')
    expect(screen.queryByTestId('player-surface-frame')).toBeNull()
  })
})

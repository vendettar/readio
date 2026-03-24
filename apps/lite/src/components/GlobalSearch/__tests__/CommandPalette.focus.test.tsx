import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchStore } from '../../../store/searchStore'
import { CommandPalette } from '../CommandPalette'

// Polyfill ResizeObserver for Radix UI
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Real-ish mocks for testing focus
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../hooks/useGlobalSearch', () => ({
  useGlobalSearch: () => ({
    podcasts: [],
    episodes: [],
    local: [],
    isLoading: false,
    isEmpty: false,
  }),
}))

vi.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}))

vi.mock('../../../lib/runtimeConfig', () => ({
  getAppConfig: () => ({
    SEARCH_SUGGESTIONS_LIMIT: 5,
    SEARCH_PODCASTS_LIMIT: 5,
    SEARCH_EPISODES_LIMIT: 5,
  }),
}))

describe('CommandPalette Focus Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSearchStore.setState({
      query: '',
      isOverlayOpen: false,
    })
  })

  it('restores focus to previous element when closed via store state', async () => {
    // Create a trigger button in the document
    const trigger = document.createElement('button')
    trigger.id = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    render(<CommandPalette />)
    const input = screen.getByTestId('command-input')

    // Open palette (simulating store-driven open)
    act(() => {
      useSearchStore.getState().openOverlay()
    })

    // Should focus input
    expect(document.activeElement).toBe(input)

    // Close palette
    act(() => {
      useSearchStore.getState().closeOverlay()
    })

    // Should restore focus to trigger
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })

    document.body.removeChild(trigger)
  })

  it('restores focus to previous element when closed via ESC key', async () => {
    const trigger = document.createElement('button')
    trigger.id = 'trigger-esc'
    document.body.appendChild(trigger)
    trigger.focus()

    render(<CommandPalette />)
    const input = screen.getByTestId('command-input')

    // Open
    act(() => {
      useSearchStore.getState().openOverlay()
    })
    expect(document.activeElement).toBe(input)

    // Press ESC on input
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })

    // Should restore focus to trigger
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })

    document.body.removeChild(trigger)
  })

  it('does not reclaim focus back to the input after direct-focus open is closed', async () => {
    render(<CommandPalette />)
    const input = screen.getByTestId('command-input')
    const outsideButton = document.createElement('button')
    outsideButton.id = 'outside-focus-target'
    document.body.appendChild(outsideButton)

    // Click to focus
    fireEvent.focus(input)
    expect(useSearchStore.getState().isOverlayOpen).toBe(true)
    expect(document.activeElement).toBe(input)

    // Close palette
    act(() => {
      useSearchStore.getState().closeOverlay()
    })

    act(() => {
      outsideButton.focus()
    })

    // Focus should stay on the user's new target instead of being reclaimed by the search input
    await waitFor(() => {
      expect(document.activeElement).toBe(outsideButton)
    })

    document.body.removeChild(outsideButton)
  })

  it('does not reclaim focus back to the input after real outside-click close from direct-focus open', async () => {
    render(<CommandPalette />)
    const input = screen.getByTestId('command-input')
    const outsideButton = document.createElement('button')
    outsideButton.id = 'outside-click-target'
    document.body.appendChild(outsideButton)

    fireEvent.focus(input)
    expect(useSearchStore.getState().isOverlayOpen).toBe(true)
    expect(document.activeElement).toBe(input)

    act(() => {
      outsideButton.focus()
      fireEvent.pointerDown(outsideButton, { button: 0 })
      fireEvent.mouseDown(outsideButton, { button: 0 })
      fireEvent.click(outsideButton, { button: 0 })
    })

    await waitFor(() => {
      expect(useSearchStore.getState().isOverlayOpen).toBe(false)
      expect(document.activeElement).toBe(outsideButton)
    })

    document.body.removeChild(outsideButton)
  })

  it('clicking neutral page space closes the overlay without returning focus to the input', async () => {
    render(<CommandPalette />)
    const input = screen.getByTestId('command-input')
    const outsideSpace = document.createElement('div')
    outsideSpace.id = 'outside-page-space'
    outsideSpace.tabIndex = -1
    document.body.appendChild(outsideSpace)

    fireEvent.focus(input)
    expect(useSearchStore.getState().isOverlayOpen).toBe(true)
    expect(document.activeElement).toBe(input)

    act(() => {
      outsideSpace.focus()
      fireEvent.pointerDown(outsideSpace, { button: 0 })
      fireEvent.mouseDown(outsideSpace, { button: 0 })
      fireEvent.click(outsideSpace, { button: 0 })
    })

    await waitFor(() => {
      expect(useSearchStore.getState().isOverlayOpen).toBe(false)
      expect(document.activeElement).toBe(outsideSpace)
      expect(document.activeElement).not.toBe(input)
    })

    document.body.removeChild(outsideSpace)
  })

  it('restores focus to input (Fallback) if the previous target is removed from DOM', async () => {
    const trigger = document.createElement('button')
    trigger.id = 'trigger-removable'
    document.body.appendChild(trigger)
    trigger.focus()

    render(<CommandPalette />)
    const input = screen.getByTestId('command-input')

    // Open
    act(() => {
      useSearchStore.getState().openOverlay()
    })
    expect(document.activeElement).toBe(input)

    // Remove trigger from DOM while palette is open
    document.body.removeChild(trigger)

    // Close palette
    act(() => {
      useSearchStore.getState().closeOverlay()
    })

    // Should fall back to input
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
  })
})

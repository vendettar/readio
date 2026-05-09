import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSearchPodcast } from '../../../lib/discovery/__tests__/fixtures'
import { buildEpisodeCompactKey } from '../../../lib/discovery/editorPicks'
import { useSearchStore } from '../../../store/searchStore'
import { CommandPalette } from '../CommandPalette'

const navigateMock = vi.fn()
const executeLocalSearchActionMock = vi.fn()
const setSubtitlesMock = vi.fn()
const makeSection = <T,>(
  items: T[] = [],
  status: 'idle' | 'loading' | 'ready' | 'unavailable' = 'ready'
) => ({
  items,
  status,
})
const mockGlobalSearchState: {
  podcastSection: ReturnType<typeof makeSection<Record<string, unknown>>>
  episodeSection: ReturnType<typeof makeSection<Record<string, unknown>>>
  localSection: ReturnType<typeof makeSection<Record<string, unknown>>>
  isLoading: boolean
  isEmpty: boolean
} = {
  podcastSection: makeSection([]),
  episodeSection: makeSection([]),
  localSection: makeSection([]),
  isLoading: false,
  isEmpty: false,
}

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
  useNavigate: () => navigateMock,
}))

vi.mock('../../../hooks/useGlobalSearch', () => ({
  useGlobalSearch: () => mockGlobalSearchState,
}))

vi.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}))

vi.mock('../../../lib/localSearchActions', () => ({
  executeLocalSearchAction: (...args: unknown[]) => executeLocalSearchActionMock(...args),
}))

vi.mock('../../../lib/runtimeConfig', () => ({
  getAppConfig: () => ({
    SEARCH_SUGGESTIONS_LIMIT: 5,
    SEARCH_PODCASTS_LIMIT: 5,
    SEARCH_EPISODES_LIMIT: 5,
  }),
}))

vi.mock('../../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
    }),
}))

vi.mock('../../../store/transcriptStore', () => ({
  useTranscriptStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setSubtitles: setSubtitlesMock,
    }),
}))

vi.mock('../../ui/popover', () => {
  let latestOnOpenChange: ((open: boolean) => void) | undefined

  const Popover = ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
  }) => {
    latestOnOpenChange = onOpenChange
    return (
      <div data-testid="popover-root" data-open={open ? 'true' : 'false'}>
        <div data-testid="popover-outside-target">outside-target</div>
        <button
          type="button"
          data-testid="popover-outside-close"
          onClick={() => onOpenChange?.(false)}
        >
          outside-close
        </button>
        {children}
      </div>
    )
  }

  const dispatchOutside = (
    handler:
      | ((event: { target: EventTarget | null; preventDefault: () => void }) => void)
      | undefined,
    target: EventTarget | null
  ) => {
    let defaultPrevented = false
    const event = {
      target,
      preventDefault: () => {
        defaultPrevented = true
      },
    }
    handler?.(event)
    if (!defaultPrevented) {
      latestOnOpenChange?.(false)
    }
  }

  const PopoverAnchor = ({ children }: { children: React.ReactNode }) => <>{children}</>
  const PopoverContent = ({
    children,
    className,
    onInteractOutside,
    onFocusOutside,
    onCloseAutoFocus, // Added
    onKeyDown,
    onMouseOver,
    onMouseLeave,
  }: {
    children: React.ReactNode
    className?: string
    onInteractOutside?: (event: { target: EventTarget | null; preventDefault: () => void }) => void
    onFocusOutside?: (event: { target: EventTarget | null; preventDefault: () => void }) => void
    onCloseAutoFocus?: (event: { preventDefault: () => void }) => void // Added
    onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
    onMouseOver?: React.MouseEventHandler<HTMLButtonElement>
    onMouseLeave?: React.MouseEventHandler<HTMLButtonElement>
  }) => (
    <div
      data-testid="popover-content"
      className={className}
      role="dialog"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        data-testid="trigger-close-auto-focus"
        onClick={() => {
          onCloseAutoFocus?.({ preventDefault: () => {} })
        }}
      >
        trigger-close-auto-focus
      </button>
      <button
        type="button"
        data-testid="popover-mouseleave-region"
        onMouseOver={onMouseOver}
        onFocus={() => {
          // no-op: keeps mock aligned with a11y lint expectations for mouse events
        }}
        onMouseLeave={onMouseLeave}
      >
        mouseleave-region
      </button>
      <button
        type="button"
        data-testid="popover-interact-anchor"
        onClick={() => {
          dispatchOutside(
            onInteractOutside,
            document.querySelector('[data-testid="command-palette-anchor"]')
          )
        }}
      >
        interact-anchor
      </button>
      <button
        type="button"
        data-testid="popover-interact-outside"
        onClick={() => {
          dispatchOutside(
            onInteractOutside,
            document.querySelector('[data-testid="popover-outside-target"]')
          )
        }}
      >
        interact-outside
      </button>
      <button
        type="button"
        data-testid="popover-focus-anchor"
        onClick={() => {
          dispatchOutside(
            onFocusOutside,
            document.querySelector('[data-testid="command-palette-anchor"]')
          )
        }}
      >
        focus-anchor
      </button>
      {children}
    </div>
  )

  return { Popover, PopoverAnchor, PopoverContent }
})

vi.mock('../../ui/command', () => {
  const CommandSelectionContext = React.createContext<((value: string) => void) | null>(null)

  const Command = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    children: React.ReactNode
  }) => (
    <CommandSelectionContext.Provider value={onValueChange ?? null}>
      <div data-testid="command-root" data-selected-value={value ?? ''}>
        <button
          type="button"
          data-testid="pick-custom"
          onClick={() => onValueChange?.('picked-value')}
        >
          pick
        </button>
        <button
          type="button"
          data-testid="trigger-enter"
          onClick={(event) => {
            const root = event.currentTarget.parentElement
            const selectedItem = root?.querySelector<HTMLElement>(
              `[data-command-item-value="${value ?? ''}"]`
            )
            selectedItem?.click()
          }}
        >
          enter
        </button>
        {children}
      </div>
    </CommandSelectionContext.Provider>
  )

  const CommandInput = ({
    value,
    onValueChange,
    onFocus,
    onKeyDown,
    hideIcon: _hideIcon,
    wrapperClassName: _wrapperClassName,
    ...rest
  }: {
    value?: string
    onValueChange?: (value: string) => void
    onFocus?: () => void
    onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
    hideIcon?: boolean
    wrapperClassName?: string
  }) => (
    <input
      data-testid="command-input"
      value={value ?? ''}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      {...rest}
    />
  )

  return {
    Command,
    CommandInput,
    CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CommandItem: ({
      children,
      value,
      onSelect,
    }: {
      children?: React.ReactNode
      value?: string
      onSelect?: () => void
    }) => {
      const setSelectedValue = React.useContext(CommandSelectionContext)

      return (
        <button
          type="button"
          cmdk-item=""
          data-command-item-value={value}
          onMouseEnter={() => {
            if (value) {
              setSelectedValue?.(value)
            }
          }}
          onClick={onSelect}
        >
          {children}
        </button>
      )
    },
    CommandList: ({ children, id }: { children: React.ReactNode; id?: string }) => (
      <div id={id}>{children}</div>
    ),
    CommandSeparator: () => <hr />,
  }
})

describe('CommandPalette', () => {
  const priorLocalResult = {
    id: 'history-local-1',
    type: 'history',
    title: 'Prior Local Result',
    subtitle: 'Files',
    badges: ['history'],
    data: {
      id: 'session-local-1',
      source: 'local',
      title: 'Prior Local Result',
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      sizeBytes: 10,
      durationSeconds: 30,
      audioId: 'audio-local-1',
      subtitleId: null,
      hasAudioBlob: true,
      progress: 0,
      audioFilename: 'local.mp3',
      subtitleFilename: '',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    executeLocalSearchActionMock.mockReset()
    setSubtitlesMock.mockReset()
    mockGlobalSearchState.podcastSection = makeSection([])
    mockGlobalSearchState.episodeSection = makeSection([])
    mockGlobalSearchState.localSection = makeSection([])
    mockGlobalSearchState.isLoading = false
    mockGlobalSearchState.isEmpty = false
    useSearchStore.setState({
      query: '',
      isOverlayOpen: false,
    })
  })

  it('resets selected value to default action when reopened with same query', async () => {
    act(() => {
      useSearchStore.setState({
        query: 'abc',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    const commandRoot = screen.getByTestId('command-root')
    expect(commandRoot.getAttribute('data-selected-value')).toBe('search-global-dummy-abc')

    fireEvent.click(screen.getByTestId('pick-custom'))
    expect(commandRoot.getAttribute('data-selected-value')).toBe('picked-value')

    act(() => {
      useSearchStore.setState({ isOverlayOpen: false })
    })
    act(() => {
      useSearchStore.setState({ isOverlayOpen: true })
    })

    await waitFor(() => {
      expect(commandRoot.getAttribute('data-selected-value')).toBe('search-global-dummy-abc')
    })
  })

  it('clears hover selection on non-item hover and when leaving results panel', () => {
    act(() => {
      useSearchStore.setState({
        query: 'abc',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    const commandRoot = screen.getByTestId('command-root')
    expect(commandRoot.getAttribute('data-selected-value')).toBe('search-global-dummy-abc')

    fireEvent.click(screen.getByTestId('pick-custom'))
    expect(commandRoot.getAttribute('data-selected-value')).toBe('picked-value')

    fireEvent.mouseEnter(screen.getByTestId('command-input'))
    expect(commandRoot.getAttribute('data-selected-value')).toBe('search-global-dummy-abc')

    fireEvent.click(screen.getByTestId('pick-custom'))
    expect(commandRoot.getAttribute('data-selected-value')).toBe('picked-value')

    fireEvent.mouseOver(screen.getByTestId('popover-mouseleave-region'))
    expect(commandRoot.getAttribute('data-selected-value')).toBe('search-global-dummy-abc')

    fireEvent.click(screen.getByTestId('pick-custom'))
    expect(commandRoot.getAttribute('data-selected-value')).toBe('picked-value')

    fireEvent.mouseLeave(screen.getByTestId('popover-mouseleave-region'))
    expect(commandRoot.getAttribute('data-selected-value')).toBe('search-global-dummy-abc')
  })

  it('keeps default selection stable when query goes non-empty -> empty -> non-empty', async () => {
    render(<CommandPalette />)

    act(() => {
      useSearchStore.setState({
        query: 'abc',
        isOverlayOpen: true,
      })
    })

    const commandRoot = screen.getByTestId('command-root')
    expect(commandRoot.getAttribute('data-selected-value')).toBe('search-global-dummy-abc')

    fireEvent.click(screen.getByTestId('pick-custom'))
    expect(commandRoot.getAttribute('data-selected-value')).toBe('picked-value')

    act(() => {
      useSearchStore.setState({ query: '' })
    })

    await waitFor(() => {
      expect(commandRoot.getAttribute('data-selected-value')).toBe('')
    })

    act(() => {
      useSearchStore.setState({ query: 'abc' })
    })

    await waitFor(() => {
      expect(commandRoot.getAttribute('data-selected-value')).toBe('search-global-dummy-abc')
    })
  })

  it('keeps Enter behavior distinct between default dummy action and a real result item', async () => {
    mockGlobalSearchState.localSection = makeSection([
      {
        ...priorLocalResult,
        title: 'Local Session',
        data: {
          ...priorLocalResult.data,
          title: 'Local Session',
        },
      },
    ])

    act(() => {
      useSearchStore.setState({
        query: 'local',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    fireEvent.click(screen.getByTestId('trigger-enter'))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/search',
        search: { q: 'local' },
      })
    })
    expect(executeLocalSearchActionMock).not.toHaveBeenCalled()
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)

    navigateMock.mockClear()

    act(() => {
      useSearchStore.setState({ isOverlayOpen: true })
    })

    const localItem = document.querySelector(
      '[data-command-item-value="local-history-local-1"]'
    ) as HTMLButtonElement | null
    expect(localItem).toBeTruthy()

    fireEvent.mouseEnter(localItem as HTMLButtonElement)
    fireEvent.click(screen.getByTestId('trigger-enter'))

    await waitFor(() => {
      expect(executeLocalSearchActionMock).toHaveBeenCalledTimes(1)
    })
    expect(navigateMock).not.toHaveBeenCalled()
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)
  })

  it('opens from store state and closes via popover outside interaction path', () => {
    render(<CommandPalette />)
    const popoverRoot = screen.getByTestId('popover-root')

    expect(popoverRoot.getAttribute('data-open')).toBe('false')

    act(() => {
      useSearchStore.getState().openOverlay()
    })

    expect(popoverRoot.getAttribute('data-open')).toBe('true')

    fireEvent.click(screen.getByTestId('popover-outside-close'))
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)
  })

  it('does not close when popover outside event target is inside the anchor', () => {
    render(<CommandPalette />)

    act(() => {
      useSearchStore.getState().openOverlay()
    })

    fireEvent.click(screen.getByTestId('popover-interact-anchor'))
    expect(useSearchStore.getState().isOverlayOpen).toBe(true)

    fireEvent.click(screen.getByTestId('popover-focus-anchor'))
    expect(useSearchStore.getState().isOverlayOpen).toBe(true)
  })

  it('closes when popover outside event target is truly outside', () => {
    render(<CommandPalette />)

    act(() => {
      useSearchStore.getState().openOverlay()
    })

    fireEvent.click(screen.getByTestId('popover-interact-outside'))
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)
  })

  it('focus opens overlay and Esc closes overlay deterministically', () => {
    render(<CommandPalette />)

    const input = screen.getByTestId('command-input')
    fireEvent.focus(input)
    expect(useSearchStore.getState().isOverlayOpen).toBe(true)

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)
  })

  it('sets combobox aria attrs and closes on Esc from panel', () => {
    act(() => {
      useSearchStore.setState({
        query: 'abc',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    const input = screen.getByTestId('command-input')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-controls')).toBe('global-search-command-panel')

    fireEvent.keyDown(screen.getByTestId('popover-mouseleave-region'), { key: 'Escape' })
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)
  })

  it('focuses the input after store-driven open (Cmd+K path)', async () => {
    render(<CommandPalette />)
    const input = screen.getByTestId('command-input')

    act(() => {
      useSearchStore.getState().openOverlay()
    })

    await waitFor(() => {
      expect(document.activeElement).toBe(input)
      expect(useSearchStore.getState().isOverlayOpen).toBe(true)
    })
  })

  it('focuses input immediately on open without waiting for timer ticks', () => {
    vi.useFakeTimers()

    try {
      render(<CommandPalette />)
      const input = screen.getByTestId('command-input')

      act(() => {
        useSearchStore.getState().openOverlay()
      })

      expect(document.activeElement).toBe(input)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps focus stable across rapid open/close cycles', () => {
    render(<CommandPalette />)
    const input = screen.getByTestId('command-input')

    for (let iteration = 0; iteration < 50; iteration += 1) {
      act(() => {
        useSearchStore.getState().openOverlay()
      })
      expect(useSearchStore.getState().isOverlayOpen).toBe(true)
      expect(document.activeElement).toBe(input)

      act(() => {
        useSearchStore.getState().closeOverlay()
      })
      expect(useSearchStore.getState().isOverlayOpen).toBe(false)
    }
  })

  it('navigates to episode detail when selecting an episode result', async () => {
    mockGlobalSearchState.episodeSection = makeSection([
      {
        podcastItunesId: '7',
        title: 'Episode Name',
        showTitle: 'Show Name',
        audioUrl: 'https://example.com/audio.mp3',
        guid: '75f3241b-439d-4786-8968-07e05e548074',
        shortDescription: 'desc',
        artwork: '',
      },
    ])
    act(() => {
      useSearchStore.setState({
        query: 'episode',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    fireEvent.click(screen.getByText('Episode Name'))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/podcast/$country/$id/$episodeKey',
        params: {
          country: 'us',
          id: '7',
          episodeKey: buildEpisodeCompactKey('75f3241b-439d-4786-8968-07e05e548074'),
        },
      })
    })
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)
  })

  it('navigates to podcast detail when selecting a podcast result', async () => {
    mockGlobalSearchState.podcastSection = makeSection([
      makeSearchPodcast({
        podcastItunesId: '42',
        title: 'Podcast Result',
        author: 'Host Name',
      }),
    ])

    act(() => {
      useSearchStore.setState({
        query: 'podcast',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    fireEvent.click(screen.getByText('Podcast Result'))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/podcast/$country/$id',
        params: {
          country: 'us',
          id: '42',
        },
      })
    })
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)
  })

  it('navigates to episode detail when selecting a non-UUID episode result', async () => {
    mockGlobalSearchState.episodeSection = makeSection([
      {
        podcastItunesId: '7',
        title: 'Episode Name',
        showTitle: 'Show Name',
        audioUrl: 'https://example.com/audio.mp3',
        guid: 'abc123-def456',
        shortDescription: 'desc',
        artwork: '',
      },
    ])
    act(() => {
      useSearchStore.setState({
        query: 'episode',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    fireEvent.click(screen.getByText('Episode Name'))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/podcast/$country/$id/$episodeKey',
        params: {
          country: 'us',
          id: '7',
          episodeKey: buildEpisodeCompactKey('abc123-def456'),
        },
      })
    })
  })

  it('passes transcript setter deps when selecting a local result', () => {
    mockGlobalSearchState.localSection = makeSection([
      {
        ...priorLocalResult,
        title: 'Local Session',
        data: {
          ...priorLocalResult.data,
          title: 'Local Session',
        },
      },
    ])
    act(() => {
      useSearchStore.setState({
        query: 'local',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    const localItem = document.querySelector('[data-command-item-value="local-history-local-1"]')
    expect(localItem).toBeTruthy()
    fireEvent.click(localItem as HTMLButtonElement)

    expect(executeLocalSearchActionMock).toHaveBeenCalledTimes(1)
    expect(executeLocalSearchActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'history-local-1',
        type: 'history',
      }),
      expect.objectContaining({
        setSubtitles: setSubtitlesMock,
      })
    )
    expect(useSearchStore.getState().isOverlayOpen).toBe(false)
  })

  it('keeps prior local results visible while a local-only refresh is in flight', () => {
    mockGlobalSearchState.localSection = makeSection([priorLocalResult])

    act(() => {
      useSearchStore.setState({
        query: 'local',
        isOverlayOpen: true,
      })
    })

    const { rerender } = render(<CommandPalette />)

    expect(screen.getByText('Prior Local Result')).toBeDefined()
    expect(screen.queryByText('searchSearching')).toBeNull()

    mockGlobalSearchState.localSection = makeSection([priorLocalResult], 'loading')
    mockGlobalSearchState.isLoading = true

    act(() => {
      useSearchStore.setState({
        query: 'local updated',
        isOverlayOpen: true,
      })
    })
    rerender(<CommandPalette />)

    expect(screen.getByText('Prior Local Result')).toBeDefined()
    expect(screen.getByText('searchSearching')).toBeDefined()
    expect(screen.queryByText('searchNoResults')).toBeNull()
  })

  it('keeps ready podcast results visible while episode section is still loading', () => {
    mockGlobalSearchState.podcastSection = makeSection([
      makeSearchPodcast({
        podcastItunesId: 'pod-1',
        title: 'Podcast Result',
        author: 'Host',
      }),
    ])
    mockGlobalSearchState.episodeSection = makeSection([], 'loading')
    mockGlobalSearchState.isLoading = true

    act(() => {
      useSearchStore.setState({
        query: 'podcast',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    expect(screen.getByText('Podcast Result')).toBeDefined()
    expect(screen.getByText('searchSearching')).toBeDefined()
    expect(screen.queryByText('searchNoResults')).toBeNull()
  })

  it('keeps panel visible and shows offline unavailable copy for active query', () => {
    mockGlobalSearchState.podcastSection = makeSection([], 'unavailable')
    mockGlobalSearchState.episodeSection = makeSection([], 'unavailable')

    act(() => {
      useSearchStore.setState({
        query: 'offline search',
        isOverlayOpen: true,
      })
    })

    render(<CommandPalette />)

    expect(screen.getByTestId('popover-content').className.includes('opacity-100')).toBe(true)
    expect(screen.getByText('offline.badge')).toBeDefined()
    expect(screen.getByText('offline.explanation')).toBeDefined()
  })

  it('keeps prior podcast results visible while a query refresh is in flight', () => {
    mockGlobalSearchState.podcastSection = makeSection([
      makeSearchPodcast({
        podcastItunesId: 'pod-1',
        title: 'Apple Podcast',
        author: 'Host',
      }),
    ])

    act(() => {
      useSearchStore.setState({
        query: 'apple',
        isOverlayOpen: true,
      })
    })

    const { rerender } = render(<CommandPalette />)

    expect(screen.getByText('Apple Podcast')).toBeDefined()
    expect(screen.queryByText('searchSearching')).toBeNull()

    mockGlobalSearchState.episodeSection = makeSection([], 'loading')
    mockGlobalSearchState.isLoading = true

    act(() => {
      useSearchStore.setState({
        query: 'apple updated',
        isOverlayOpen: true,
      })
    })
    rerender(<CommandPalette />)

    expect(screen.getByText('Apple Podcast')).toBeDefined()
    expect(screen.getByText('searchSearching')).toBeDefined()
    expect(screen.queryByText('searchNoResults')).toBeNull()
  })

  describe('Focus Restoration Contract', () => {
    it('restores focus to an external element successfully', async () => {
      const externalButton = document.createElement('button')
      externalButton.tabIndex = 0
      document.body.appendChild(externalButton)
      externalButton.focus()
      expect(document.activeElement).toBe(externalButton)

      render(<CommandPalette />)

      act(() => {
        useSearchStore.getState().openOverlay()
      })

      // Palette is open, input should be focused
      const input = screen.getByTestId('command-input')
      expect(document.activeElement).toBe(input)

      // Simulate close with auto-focus restoration
      fireEvent.click(screen.getByTestId('trigger-close-auto-focus'))
      expect(document.activeElement).toBe(externalButton)

      document.body.removeChild(externalButton)
    })

    it('clears stale restore target if opened while already in search input', async () => {
      // 1. Session 1: Open from external button
      const externalButton = document.createElement('button')
      document.body.appendChild(externalButton)
      externalButton.focus()

      render(<CommandPalette />)
      act(() => {
        useSearchStore.getState().openOverlay()
      })

      // Close session 1 but assume something prevented auto-focus restore (e.g. manual navigation)
      // Actually if we just close without calling the trigger, the ref might stay if not for the new hygiene
      act(() => {
        useSearchStore.getState().closeOverlay()
      })

      // 2. Session 2: Click the input directly (not a shortcut from external)
      const input = screen.getByTestId('command-input')
      input.focus() // Input is now the active element
      expect(document.activeElement).toBe(input)

      act(() => {
        useSearchStore.getState().openOverlay()
      })

      // Now close with auto-focus trigger.
      // It should NOT restore to externalButton because we recomputed the session while focused on input.
      fireEvent.click(screen.getByTestId('trigger-close-auto-focus'))

      // Should fall back to Radix default or keep input (in our mock Path A fallback focuses input if not valid)
      // Since previousFocusRef was cleared, it won't be externalButton.
      expect(document.activeElement).not.toBe(externalButton)

      document.body.removeChild(externalButton)
    })

    it('successive opens with different origins do not leak restore targets', async () => {
      const btn1 = document.createElement('button')
      const btn2 = document.createElement('button')
      document.body.appendChild(btn1)
      document.body.appendChild(btn2)

      render(<CommandPalette />)

      // Session A: btn1
      btn1.focus()
      act(() => {
        useSearchStore.getState().openOverlay()
      })
      fireEvent.click(screen.getByTestId('trigger-close-auto-focus'))
      expect(document.activeElement).toBe(btn1)

      act(() => {
        useSearchStore.getState().closeOverlay()
      })

      // Session B: btn2
      btn2.focus()
      act(() => {
        useSearchStore.getState().openOverlay()
      })
      fireEvent.click(screen.getByTestId('trigger-close-auto-focus'))
      expect(document.activeElement).toBe(btn2)

      document.body.removeChild(btn1)
      document.body.removeChild(btn2)
    })
  })
})

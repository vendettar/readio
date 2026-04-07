import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSCRIPT_IMPORTED_EVENT } from '../../../lib/player/playbackExport'
import { usePlayerStore } from '../../../store/playerStore'
import { usePlayerSurfaceStore } from '../../../store/playerSurfaceStore'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { PlayerSurfaceFrame } from '../PlayerSurfaceFrame'

vi.mock('../../hooks/usePageVisibility', () => ({
  usePageVisibility: () => true,
}))

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}))

vi.mock('../../hooks/useImageObjectUrl', () => ({
  useImageObjectUrl: () => null,
}))

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg />,
  Download: () => <svg />,
  Maximize2: () => <svg />,
  Minimize2: () => <svg />,
  Pause: () => <svg />,
  Play: () => <svg />,
  Settings2: () => <svg />,
  SkipBack: () => <svg />,
  SkipForward: () => <svg />,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      ...rest
    }: {
      children?: ReactNode
      className?: string
      [key: string]: unknown
    }) => (
      <div className={className} data-testid={rest['data-testid'] as string}>
        {children}
      </div>
    ),
  },
}))

vi.mock('../ReadingContent', () => ({
  ReadingContent: ({ setIsAutoScrolling }: { setIsAutoScrolling: (value: boolean) => void }) => (
    <button type="button" onClick={() => setIsAutoScrolling(false)}>
      disable-follow
    </button>
  ),
}))

vi.mock('../../FollowButton', () => ({
  FollowButton: ({ isVisible, onClick }: { isVisible: boolean; onClick: () => void }) =>
    isVisible ? (
      <button type="button" onClick={onClick}>
        Follow
      </button>
    ) : null,
}))

vi.mock('../../Player/ShareButton', () => ({
  ShareButton: () => <button type="button">Share</button>,
}))

vi.mock('../../Player/SleepTimerButton', () => ({
  SleepTimerButton: () => <button type="button">Timer</button>,
}))

vi.mock('../../ReadingBgControl', () => ({
  ReadingBgControl: () => <div />,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('PlayerSurfaceFrame follow restore', () => {
  beforeEach(() => {
    act(() => {
      usePlayerSurfaceStore.getState().reset()
      usePlayerStore.setState({
        audioLoaded: true,
        audioTitle: 'Test Track',
        audioUrl: 'blob:test-track',
        localTrackId: 'track-1',
        isPlaying: true,
        episodeMetadata: {
          originalAudioUrl: 'blob:test-track',
        },
      })
      useTranscriptStore.setState({
        subtitlesLoaded: true,
        subtitles: [{ start: 0, end: 1, text: 'test' }],
      })
    })
  })

  it('re-enables follow mode for the current session when transcript import succeeds', async () => {
    await act(async () => {
      render(<PlayerSurfaceFrame mode="full" />)
    })

    fireEvent.click(screen.getByRole('button', { name: 'disable-follow' }))
    expect(screen.getByRole('button', { name: 'Follow' })).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(TRANSCRIPT_IMPORTED_EVENT, {
          detail: {
            playbackIdentityKey: 'local-track:track-1',
            localTrackId: 'track-1',
            normalizedAudioUrl: null,
          },
        })
      )
    })

    expect(screen.queryByRole('button', { name: 'Follow' })).toBeNull()
  })

  it('ignores transcript import events for a different session identity', async () => {
    await act(async () => {
      render(<PlayerSurfaceFrame mode="full" />)
    })

    fireEvent.click(screen.getByRole('button', { name: 'disable-follow' }))
    expect(screen.getByRole('button', { name: 'Follow' })).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(TRANSCRIPT_IMPORTED_EVENT, {
          detail: {
            playbackIdentityKey: 'local-track:other-track',
            localTrackId: 'other-track',
            normalizedAudioUrl: null,
          },
        })
      )
    })

    expect(screen.getByRole('button', { name: 'Follow' })).toBeTruthy()
  })
})

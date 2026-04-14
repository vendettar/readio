import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { type FileSubtitle, type PodcastDownload, TRACK_SOURCE } from '../../../lib/db/types'
import { SUPPORTED_SUBTITLE_EXPORT_FORMATS } from '../../../lib/subtitles'
import { DownloadTrackCard } from '../DownloadTrackCard'

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  }
})

vi.mock('../../interactive/InteractiveArtwork', () => ({
  InteractiveArtwork: (props: { playControlVisibility?: string }) => (
    <div
      data-testid="interactive-artwork"
      data-play-control-visibility={props.playControlVisibility}
    />
  ),
}))

vi.mock('../../interactive/InteractiveTitle', () => ({
  InteractiveTitle: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function buildPodcastDownload(overrides: Partial<PodcastDownload> = {}): PodcastDownload {
  return {
    id: 'track-1',
    name: 'Episode',
    sourceType: TRACK_SOURCE.PODCAST_DOWNLOAD,
    sourceUrlNormalized: 'https://example.com/audio.mp3',
    sourceArtworkUrl: 'https://example.com/cover.jpg',
    audioId: 'audio-1',
    sizeBytes: 1024,
    createdAt: 1,
    downloadedAt: 1,
    lastAccessedAt: 1,
    countryAtSave: 'US',
    ...overrides,
  }
}

describe('DownloadTrackCard artwork play visibility wiring', () => {
  it('passes hover-or-touch visibility to InteractiveArtwork', () => {
    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={[]}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
      />
    )

    expect(
      screen.getByTestId('interactive-artwork').getAttribute('data-play-control-visibility')
    ).toBe('hover-or-touch')
  })

  it('opens subtitle row export menu and routes the selected format', async () => {
    const onExportSubtitle = vi.fn()
    const subtitles: FileSubtitle[] = [
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'Subtitle 1',
        sourceKind: 'asr_online',
        createdAt: 1,
        status: 'ready',
      },
    ]
    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={subtitles}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={onExportSubtitle}
      />
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'exportOptions' }))
    for (const format of SUPPORTED_SUBTITLE_EXPORT_FORMATS) {
      expect(await screen.findByRole('menuitem', { name: format })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('menuitem', { name: 'vtt' }))
    expect(onExportSubtitle).toHaveBeenCalledWith('track-1', 'sub-1', 'vtt')
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'srt' })).toBeNull()
    })
  })

  it('calls onImportSubtitle from overflow menu action', async () => {
    const onImportSubtitle = vi.fn()

    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={[]}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
        onImportSubtitle={onImportSubtitle}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'importTranscript' }))

    expect(onImportSubtitle).toHaveBeenCalledTimes(1)
  })

  it('closes the overflow menu on outside click without firing outside actions', async () => {
    const outsideClick = vi.fn()
    const onPlay = vi.fn()

    render(
      <div>
        <button type="button" onClick={outsideClick}>
          outside
        </button>
        <DownloadTrackCard
          track={buildPodcastDownload()}
          artworkBlob={null}
          subtitles={[]}
          onPlay={onPlay}
          onRemove={vi.fn()}
          onSetActiveSubtitle={vi.fn()}
          onDeleteSubtitle={vi.fn()}
          onExportSubtitle={vi.fn()}
          onExportAudio={vi.fn()}
          onImportSubtitle={vi.fn()}
        />
      </div>
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    expect(await screen.findByRole('menuitem', { name: 'exportAudio' })).toBeDefined()

    const outsideButton = screen.getByRole('button', { name: 'outside' })
    fireEvent.pointerDown(outsideButton)

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'exportAudio' })).toBeNull()
    })
    expect(screen.queryByRole('menuitem', { name: 'importTranscript' })).toBeNull()
    expect(outsideClick).not.toHaveBeenCalled()
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('routes download-card export audio action through the matching handler', async () => {
    const onExportAudio = vi.fn()

    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={[]}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
        onExportAudio={onExportAudio}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByTestId('downloads-export-audio'))

    expect(onExportAudio).toHaveBeenCalledTimes(1)
  })

  it('shows Generate transcript in overflow menu when no subtitles exist', async () => {
    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={[]}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
        onRetranscribe={vi.fn()}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    expect(await screen.findByRole('menuitem', { name: 'asrGenerateTranscript' })).toBeDefined()
  })

  it('shows Regenerate transcript in overflow menu when subtitles already exist', async () => {
    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={[
          {
            id: 'sub-1',
            trackId: 'track-1',
            subtitleId: 'subtitle-1',
            name: 'Subtitle 1',
            sourceKind: 'asr_online',
            createdAt: 1,
            status: 'ready',
          },
        ]}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
        onRetranscribe={vi.fn()}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    expect(await screen.findByRole('menuitem', { name: 'asrRegenerateTranscript' })).toBeDefined()
  })

  it('renders provider and model badges on subtitle row when metadata exists', () => {
    const subtitles: FileSubtitle[] = [
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'Subtitle 1',
        sourceKind: 'asr_online',
        provider: 'groq',
        model: 'whisper-large-v3',
        createdAt: 1,
        status: 'ready',
      },
    ]

    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={subtitles}
        onPlay={vi.fn()}
        onRemove={vi.fn().mockResolvedValue(true)}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
      />
    )

    expect(screen.getByText('groq')).toBeDefined()
    expect(screen.getByText('whisper-large-v3')).toBeDefined()
  })

  it('renders subtitle row title from episode title, not subtitle version name', () => {
    const subtitles: FileSubtitle[] = [
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'ASR - whisper-large-v3 - 2026-03-02',
        sourceKind: 'asr_online',
        createdAt: 1,
        status: 'ready',
      },
    ]

    render(
      <DownloadTrackCard
        track={buildPodcastDownload({ sourceEpisodeTitle: 'Episode Title' })}
        artworkBlob={null}
        subtitles={subtitles}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
      />
    )

    expect(screen.getAllByText('Episode Title').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('ASR - whisper-large-v3 - 2026-03-02')).toBeNull()
  })

  it('renders imported subtitle row title from imported filename', () => {
    const subtitles: FileSubtitle[] = [
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'imported-caption.vtt',
        sourceKind: 'manual_upload',
        createdAt: 1,
        status: 'ready',
      },
    ]

    render(
      <DownloadTrackCard
        track={buildPodcastDownload({ sourceEpisodeTitle: 'Episode Title' })}
        artworkBlob={null}
        subtitles={subtitles}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
      />
    )

    expect(screen.getByText('imported-caption.vtt')).toBeDefined()
    expect(screen.queryByText('Episode Title')).not.toBeNull()
    expect(screen.getByText('subtitleVersionSourceManual')).toBeDefined()
  })

  it('renders built-in subtitle source badge on subtitle row', () => {
    const subtitles: FileSubtitle[] = [
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'Built-in transcript',
        sourceKind: 'built_in',
        createdAt: 1,
        status: 'ready',
      },
    ]

    render(
      <DownloadTrackCard
        track={buildPodcastDownload({ sourceEpisodeTitle: 'Episode Title' })}
        artworkBlob={null}
        subtitles={subtitles}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
      />
    )

    expect(screen.getByText('subtitleVersionSourceBuiltIn')).toBeDefined()
  })

  it('requires confirm before deleting subtitle row', async () => {
    const onDeleteSubtitle = vi.fn()
    const subtitles: FileSubtitle[] = [
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'Subtitle 1',
        sourceKind: 'asr_online',
        createdAt: 1,
        status: 'ready',
      },
    ]

    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={subtitles}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={onDeleteSubtitle}
        onExportSubtitle={vi.fn()}
      />
    )

    await act(async () => {
      fireEvent.click(screen.getByLabelText('commonDelete'))
    })
    expect(onDeleteSubtitle).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByTestId('subtitle-delete-confirm-sub-1'))
    })
    expect(onDeleteSubtitle).toHaveBeenCalledWith('track-1', 'sub-1')
  })

  it('dismisses inline subtitle delete confirm on outside click', () => {
    const onDeleteSubtitle = vi.fn()
    const subtitles: FileSubtitle[] = [
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'Subtitle 1',
        sourceKind: 'asr_online',
        createdAt: 1,
        status: 'ready',
      },
    ]

    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={subtitles}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={onDeleteSubtitle}
        onExportSubtitle={vi.fn()}
      />
    )

    fireEvent.click(screen.getByLabelText('commonDelete'))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('button', { name: 'commonCancel' })).toBeNull()
    expect(onDeleteSubtitle).not.toHaveBeenCalled()
  })

  it('re-enables subtitle delete confirm buttons when delete throws', async () => {
    const onDeleteSubtitle = vi.fn().mockRejectedValue(new Error('subtitle delete failed'))
    const subtitles: FileSubtitle[] = [
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'Subtitle 1',
        sourceKind: 'asr_online',
        createdAt: 1,
        status: 'ready',
      },
    ]

    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={subtitles}
        onPlay={vi.fn()}
        onRemove={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={onDeleteSubtitle}
        onExportSubtitle={vi.fn()}
      />
    )

    fireEvent.click(screen.getByLabelText('commonDelete'))

    const cancelButton = screen.getByRole('button', { name: 'commonCancel' })
    const deleteButton = screen.getByTestId('subtitle-delete-confirm-sub-1')

    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(onDeleteSubtitle).toHaveBeenCalledWith('track-1', 'sub-1')
      expect(cancelButton.hasAttribute('disabled')).toBe(false)
      expect(deleteButton.hasAttribute('disabled')).toBe(false)
    })
  })

  it('re-enables delete confirm buttons when remove throws', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('remove failed'))

    render(
      <DownloadTrackCard
        track={buildPodcastDownload()}
        artworkBlob={null}
        subtitles={[]}
        onPlay={vi.fn()}
        onRemove={onRemove}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSubtitle={vi.fn()}
        onExportSubtitle={vi.fn()}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'commonDelete' }))

    const cancelButton = screen.getByRole('button', { name: 'commonCancel' })
    const deleteButton = screen.getByRole('button', { name: 'commonDelete' })

    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledTimes(1)
      expect(cancelButton.hasAttribute('disabled')).toBe(false)
      expect(deleteButton.hasAttribute('disabled')).toBe(false)
    })
  })
})
